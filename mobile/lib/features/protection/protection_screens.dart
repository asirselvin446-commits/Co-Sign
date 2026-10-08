import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import '../../ui/widgets.dart';
import '../guardians/guardians_screens.dart';
import '../home/family_tab.dart';

const _monitorTokenKey = 'cosign.monitor.token.v1';

/// Keeps the native background monitor configured (server URL, upload token, language).
class ProtectionController {
  ProtectionController(this.ref);
  final Ref ref;

  Future<void> enable() async {
    final api = ref.read(apiProvider);
    final status = await api.monitorStatus();
    await api.setMonitorConsent(true, status.consentVersion);
    final token = await api.issueMonitorToken();
    await ref.read(secretStoreProvider).write(_monitorTokenKey, token);
    await sync();
  }

  Future<void> disable() async {
    final api = ref.read(apiProvider);
    final status = await api.monitorStatus();
    await api.setMonitorConsent(false, status.consentVersion);
    await ref.read(secretStoreProvider).delete(_monitorTokenKey);
    await ref.read(signalsChannelProvider).monitorConfigure(baseUrl: ref.read(configProvider).apiBaseUrl, token: null, enabled: false, lang: ref.read(settingsProvider).language);
  }

  /// Push the current token and language to the native monitor (after sign-in or a language change).
  Future<void> sync() async {
    final token = await ref.read(secretStoreProvider).read(_monitorTokenKey);
    await ref.read(signalsChannelProvider).monitorConfigure(
          baseUrl: ref.read(configProvider).apiBaseUrl,
          token: token,
          enabled: token != null,
          lang: ref.read(settingsProvider).language,
        );
  }
}

final protectionControllerProvider = Provider<ProtectionController>((ref) => ProtectionController(ref));

class ProtectionState {
  const ProtectionState(this.server, this.native);
  final MonitorStatus server;
  final Map<String, bool> native;
  bool get on => server.consented && server.enabledOnThisPhone;
}

final protectionProvider = FutureProvider.autoDispose<ProtectionState>((ref) async {
  final server = await ref.watch(apiProvider).monitorStatus();
  final native = await ref.watch(signalsChannelProvider).monitorStatus();
  return ProtectionState(server, native);
});

/// Setup screen on the protected person's phone. Every part is explained and opt-in; turning
/// protection on records consent, and the phone shows a permanent notification while it is on.
class FamilyProtectionScreen extends ConsumerStatefulWidget {
  const FamilyProtectionScreen({super.key});
  @override
  ConsumerState<FamilyProtectionScreen> createState() => _FamilyProtectionScreenState();
}

class _FamilyProtectionScreenState extends ConsumerState<FamilyProtectionScreen> with WidgetsBindingObserver {
  bool _busy = false;
  AppFailure? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back from a system settings page: show the new status.
    if (state == AppLifecycleState.resumed) ref.invalidate(protectionProvider);
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await fn();
      ref.invalidate(protectionProvider);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final state = ref.watch(protectionProvider);
    return AppPage(
      title: l.familyProtection,
      children: [
        BodyText(l.fpIntro),
        const Gap(8),
        BodyText(l.fpWho, emphasis: true),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
        const Gap(),
        AsyncBody<ProtectionState>(
          value: state,
          onRetry: () => ref.invalidate(protectionProvider),
          builder: (s) => s.on ? _onView(context, s) : _offView(context, s),
        ),
      ],
    );
  }

  Widget _offView(BuildContext context, ProtectionState s) {
    final l = context.l10n;
    final controller = ref.read(protectionControllerProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(l.fpConsentBody))),
      SpeakButton(text: '${l.fpIntro} ${l.fpConsentBody}'),
      const Gap(),
      if (s.server.guardians == 0) ...[
        BodyText(l.fpNeedsGuardian, emphasis: true),
        const Gap(10),
        SecondaryButton(label: l.inviteGuardian, onPressed: () => context.push('/guardians')),
      ] else
        PrimaryButton(label: l.fpTurnOn, icon: Icons.shield, busy: _busy, onPressed: () => _run(controller.enable)),
    ]);
  }

  Widget _onView(BuildContext context, ProtectionState s) {
    final l = context.l10n;
    final channel = ref.read(signalsChannelProvider);
    final controller = ref.read(protectionControllerProvider);
    final items = <_Item>[
      _Item(l.fpAppWatch, null, s.native['usageAccess'] ?? false, () => channel.monitorOpen('usageAccess')),
      _Item(l.fpAlerts, null, s.native['notificationAccess'] ?? false, () => channel.monitorOpen('notificationAccess')),
      _Item(l.fpCalls, null, s.native['callScreening'] ?? false, () => _run(() async => channel.requestCallScreening())),
      _Item(l.fpContacts, null, (s.native['contacts'] ?? false) && (s.native['phoneState'] ?? false), () => _run(() async => channel.requestPermissions(['phone', 'callLog', 'contacts']))),
      _Item(l.fpScreens, l.fpScreensHelp, s.native['accessibility'] ?? false, () => channel.monitorOpen('accessibility')),
      _Item(l.fpPause, null, (s.native['overlay'] ?? false) || (s.native['accessibility'] ?? false), () => channel.monitorOpen('overlay')),
      _Item(l.fpUnlockWatch, null, s.native['deviceAdmin'] ?? false, () => channel.monitorOpen('deviceAdmin')),
      _Item(l.fpBattery, null, s.native['batteryUnrestricted'] ?? false, () => channel.monitorOpen('battery')),
    ];
    final ready = items.where((i) => i.ready).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Card(
        color: Theme.of(context).colorScheme.primaryContainer,
        child: ListTile(leading: const Icon(Icons.verified_user), title: Text(l.fpOn), subtitle: Text(l.fpCoverage(ready, items.length))),
      ),
      SectionTitle(l.fpChecklist),
      for (final i in items)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(i.ready ? Icons.check_circle : Icons.radio_button_unchecked, color: i.ready ? Colors.green.shade700 : null, semanticLabel: i.ready ? l.fpReady : ''),
                const SizedBox(width: 10),
                Expanded(child: BodyText(i.title)),
              ]),
              if (i.help != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(i.help!, style: Theme.of(context).textTheme.bodySmall)),
              if (!i.ready) Padding(padding: const EdgeInsets.only(top: 8), child: SecondaryButton(label: l.fpSetUp, onPressed: _busy ? null : () => i.onSetUp())),
            ]),
          ),
        ),
      const Gap(),
      SecondaryButton(label: l.fpTurnOff, danger: true, onPressed: _busy ? null : () => _run(controller.disable)),
    ]);
  }
}

class _Item {
  _Item(this.title, this.help, this.ready, this.onSetUp);
  final String title;
  final String? help;
  final bool ready;
  final FutureOr<void> Function() onSetUp;
}

// ----------------------------------------------------------------------------- guardian side

final alertsProvider = FutureProvider.autoDispose<List<GuardianAlert>>((ref) => ref.watch(apiProvider).guardianAlerts());

String categoryLabel(AppLocalizations l, String? category) => switch (category) {
      'bank' => l.catBank,
      'upi' => l.catUpi,
      'wallet' => l.catWallet,
      'email' => l.catEmail,
      'social' => l.catSocial,
      'messaging' => l.catMessaging,
      'remote_access' => l.catRemote,
      _ => '',
    };

/// Compact alert row, used in the guardian inbox.
class AlertTile extends ConsumerWidget {
  const AlertTile({super.key, required this.alert});
  final GuardianAlert alert;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: alert.critical && !alert.acknowledged ? scheme.errorContainer : null,
      child: ListTile(
        leading: Icon(alert.pauseActive ? Icons.pan_tool : (alert.critical ? Icons.report : Icons.warning_amber), color: alert.critical ? scheme.error : null),
        title: Text('${alert.critical ? l.alertUrgent : l.alertWarning} · ${alert.personName}'),
        subtitle: Text([
          if (alert.reasons.isNotEmpty) alert.reasons.first.text,
          formatClock(alert.occurredAt, lang),
        ].join('\n')),
        isThreeLine: true,
        onTap: () => context.push('/guardian/alerts/${alert.id}'),
      ),
    );
  }
}

class AlertDetailScreen extends ConsumerStatefulWidget {
  const AlertDetailScreen({super.key, required this.alertId});
  final String alertId;
  @override
  ConsumerState<AlertDetailScreen> createState() => _AlertDetailScreenState();
}

class _AlertDetailScreenState extends ConsumerState<AlertDetailScreen> {
  bool _busy = false;
  AppFailure? _error;

  Future<void> _run(Future<void> Function() fn, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await fn();
      ref.invalidate(alertsProvider);
      if (done != null && mounted) showMessage(context, done);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final alerts = ref.watch(alertsProvider);
    return AppPage(
      title: l.alertsTitle,
      children: [
        AsyncBody<List<GuardianAlert>>(
          value: alerts,
          onRetry: () => ref.invalidate(alertsProvider),
          builder: (list) {
            final a = list.where((x) => x.id == widget.alertId).firstOrNull;
            if (a == null) return FailureCard(failure: AppFailure('NOT_FOUND'));
            final person = ref.watch(peopleProvider).value?.where((p) => p.linkId == a.personLinkId).firstOrNull;
            final callFirst = l.callFirst(a.personName);
            final label = categoryLabel(l, a.appCategory);
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Semantics(header: true, child: Text('${a.critical ? l.alertUrgent : l.alertWarning}: ${a.personName}', style: Theme.of(context).textTheme.headlineSmall)),
              const Gap(8),
              BodyText(formatClock(a.occurredAt, lang)),
              if (label.isNotEmpty) BodyText(l.appInvolved(label)),
              SectionTitle(l.whyPaused),
              ReasonList(reasons: a.reasons),
              const Gap(8),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(callFirst, emphasis: true))),
              SpeakButton(text: [a.personName, ...a.reasons.map((r) => r.text), callFirst].join('. '), autoSpeak: !a.acknowledged),
              if (a.pauseActive) ...[
                const Gap(),
                BodyText(l.alertPaused, emphasis: true),
                const Gap(10),
                PrimaryButton(label: l.releasePause, icon: Icons.lock_open, busy: _busy, onPressed: () => _run(() => ref.read(apiProvider).releasePause(a.pauseId!), done: l.pauseReleased)),
              ],
              if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
              if (!a.pauseActive && person != null && person.canAct && (person.protection?.on ?? false)) ...[const Gap(), GuardianControls(person: person)],
              const Gap(),
              if (!a.acknowledged) SecondaryButton(label: l.markSeen, onPressed: _busy ? null : () => _run(() => ref.read(apiProvider).acknowledgeAlert(a.id))),
            ]);
          },
        ),
      ],
    );
  }
}

// ----------------------------------------------------------------------------- person and pause

/// One person I guard: their status, the controls, and their recent alerts. Opened from the Family
/// tab, from "I need help", or from a notification's "Pause their phone" button (act=pause).
class PersonScreen extends ConsumerWidget {
  const PersonScreen({super.key, required this.linkId, this.act});
  final String linkId;
  final String? act;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final people = ref.watch(peopleProvider);
    final alerts = ref.watch(alertsProvider);
    return AppPage(
      title: l.tabFamily,
      children: [
        AsyncBody<List<Person>>(
          value: people,
          onRetry: () => ref.invalidate(peopleProvider),
          builder: (list) {
            final p = list.where((x) => x.linkId == linkId).firstOrNull;
            if (p == null) return FailureCard(failure: AppFailure('NOT_FOUND'));
            final mine = alerts.value?.where((a) => a.personLinkId == linkId).toList() ?? const <GuardianAlert>[];
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              PersonCard(person: p, lang: lang),
              const Gap(),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(l.callFirst(p.displayName), emphasis: true))),
              if (act == 'pause' && p.protection != null && p.protection!.on && !p.protection!.paused) ...[
                const Gap(),
                // The notification button already said "Pause their phone": do it now.
                GuardianControls(person: p, autoPause: true),
              ],
              SectionTitle(l.alertsTitle),
              if (mine.isEmpty) BodyText(l.noAlerts) else for (final a in mine) AlertTile(alert: a),
            ]);
          },
        ),
      ],
    );
  }
}

/// A paused person asked to continue (or a guardian paused them). One tap lets them continue;
/// from the notification's "Let them continue" button (act=release) it happens straight away.
class PauseRequestScreen extends ConsumerStatefulWidget {
  const PauseRequestScreen({super.key, required this.pauseId, this.act});
  final String pauseId;
  final String? act;
  @override
  ConsumerState<PauseRequestScreen> createState() => _PauseRequestScreenState();
}

class _PauseRequestScreenState extends ConsumerState<PauseRequestScreen> {
  PauseView? _pause;
  AppFailure? _error;
  bool _busy = false;
  bool _released = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load(autoRelease: widget.act == 'release'));
  }

  Future<void> _load({bool autoRelease = false}) async {
    try {
      final p = await ref.read(apiProvider).guardianPause(widget.pauseId);
      if (!mounted) return;
      setState(() => _pause = p);
      if (autoRelease && p.active) await _release();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  Future<void> _release() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiProvider).releasePause(widget.pauseId);
      if (mounted) setState(() => _released = true);
      ref
        ..invalidate(peopleProvider)
        ..invalidate(alertsProvider);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = _pause;
    if (p == null) return AppPage(title: l.tabFamily, children: [if (_error != null) FailureCard(failure: _error!, onRetry: _load) else const LoadingView()]);
    final open = p.active && !_released;
    return AppPage(
      title: l.tabFamily,
      bottom: open
          ? PrimaryButton(label: l.letContinue, icon: Icons.lock_open, busy: _busy, onPressed: _release)
          : PrimaryButton(label: l.close, onPressed: () => context.canPop() ? context.pop() : context.go('/home?tab=family')),
      children: [
        Semantics(header: true, child: Text(l.pauseAskTitle(p.personName), style: Theme.of(context).textTheme.headlineSmall)),
        const Gap(8),
        if (p.byGuardian) BodyText(l.pauseByYou),
        SectionTitle(l.whyPaused),
        ReasonList(reasons: p.reasons),
        const Gap(8),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(l.callFirst(p.personName), emphasis: true))),
        const Gap(),
        if (_released) Semantics(liveRegion: true, child: BodyText(l.letContinueDone(p.personName), emphasis: true)),
        if (!p.active && !_released) BodyText(l.pauseEnded, emphasis: true),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}
