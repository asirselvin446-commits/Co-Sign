import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../guardians/guardians_screens.dart';
import '../protection/protection_screens.dart';
import '../signin/signin_screens.dart';
import 'home_screen.dart';

/// Everything the Protection tab shows, loaded together.
class ProtectionHome {
  const ProtectionHome({required this.protection, required this.guardians, required this.myAlerts, required this.openChecks, required this.recovery});
  final ProtectionState protection;
  final GuardianList guardians;
  final List<MyAlert> myAlerts;
  final List<StepupView> openChecks;
  final ActiveRecovery? recovery;

  List<GuardianView> get activeGuardians => guardians.guardians.where((g) => g.status == 'active' || g.status == 'pending_removal').toList();
}

final myAlertsProvider = FutureProvider.autoDispose<List<MyAlert>>((ref) => ref.watch(apiProvider).myAlerts());
final openChecksProvider = FutureProvider.autoDispose<List<StepupView>>((ref) => ref.watch(apiProvider).openStepups());
final activeRecoveryProvider = FutureProvider.autoDispose<ActiveRecovery?>((ref) => ref.watch(apiProvider).activeRecovery());

final protectionHomeProvider = FutureProvider.autoDispose<ProtectionHome>((ref) async {
  final results = await Future.wait<Object?>([
    ref.watch(protectionProvider.future),
    ref.watch(guardiansProvider.future),
    ref.watch(myAlertsProvider.future),
    ref.watch(openChecksProvider.future),
    ref.watch(activeRecoveryProvider.future),
  ]);
  return ProtectionHome(
    protection: results[0]! as ProtectionState,
    guardians: results[1]! as GuardianList,
    myAlerts: results[2]! as List<MyAlert>,
    openChecks: results[3]! as List<StepupView>,
    recovery: results[4] as ActiveRecovery?,
  );
});

void refreshProtection(WidgetRef ref) => ref
  ..invalidate(protectionProvider)
  ..invalidate(guardiansProvider)
  ..invalidate(myAlertsProvider)
  ..invalidate(openChecksProvider)
  ..invalidate(activeRecoveryProvider)
  ..invalidate(autofillStatusProvider)
  ..invalidate(mySigninsProvider);

enum SafetyState { protected, warning, paused, off, noGuardian }

/// What the status band says, from the most to the least urgent.
SafetyState safetyStateOf(ProtectionHome h, DateTime now) {
  if (h.activeGuardians.isEmpty) return SafetyState.noGuardian;
  if (!h.protection.on) return SafetyState.off;
  if (h.protection.server.activePauseId != null) return SafetyState.paused;
  final recent = h.myAlerts.where((a) => now.difference(a.occurredAt) < const Duration(minutes: 30));
  if (recent.isNotEmpty) return SafetyState.warning;
  return SafetyState.protected;
}

class ProtectionTab extends ConsumerStatefulWidget {
  const ProtectionTab({super.key});
  @override
  ConsumerState<ProtectionTab> createState() => _ProtectionTabState();
}

class _ProtectionTabState extends ConsumerState<ProtectionTab> with WidgetsBindingObserver {
  bool _helpBusy = false;
  bool _helpSent = false;
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
    if (state == AppLifecycleState.resumed) refreshProtection(ref);
  }

  Future<void> _help() async {
    setState(() {
      _helpBusy = true;
      _error = null;
    });
    try {
      await ref.read(apiProvider).askForHelp();
      if (mounted) setState(() => _helpSent = true);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _helpBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final home = ref.watch(protectionHomeProvider);
    // Owned here (the tab stays mounted), so scrolling the card away does not reload them.
    final autofill = ref.watch(autofillStatusProvider);
    final mySignins = ref.watch(mySigninsProvider);
    return TabBody(
      onRefresh: () async {
        refreshProtection(ref);
        try {
          await ref.read(protectionHomeProvider.future);
        } on Object {
          // The failure is shown in the list itself.
        }
      },
      children: [
        AsyncBody<ProtectionHome>(
          value: home,
          onRetry: () => refreshProtection(ref),
          builder: (h) {
            final state = safetyStateOf(h, DateTime.now());
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (h.recovery != null) ...[RecoveryBanner(recovery: h.recovery!, onChanged: () => refreshProtection(ref)), const Gap()],
              StatusBand(state: state, home: h, lang: lang),
              const Gap(),
              // Co-Sign is sign-in software first: the guardian signs the person in, safely.
              if (state != SafetyState.noGuardian) ...[SignInHelpCard(protectionOn: h.protection.on, status: autofill, recent: mySignins), const Gap()],
              if (state == SafetyState.noGuardian)
                PrimaryButton(label: l.inviteGuardian, icon: Icons.person_add_alt_1, onPressed: () => context.push('/guardians/invite'))
              else if (state == SafetyState.off)
                PrimaryButton(label: l.turnOnProtection, icon: Icons.shield, onPressed: () => context.push('/protection'))
              else ...[
                _HelpButton(busy: _helpBusy, sent: _helpSent, onPressed: _help),
                if (_helpSent) ...[const Gap(10), Semantics(liveRegion: true, child: BodyText(l.needHelpSent, emphasis: true))],
              ],
              if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
              for (final c in h.openChecks) ...[
                const Gap(),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.gpp_maybe_outlined),
                    title: Text(l.openCheck),
                    subtitle: Text(c.actionLabel),
                    trailing: Text(l.openCheckAction, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w700)),
                    onTap: () => context.push('/stepup/${c.id}'),
                  ),
                ),
              ],
              SectionTitle(l.watchTitle),
              _WatchList(native: h.protection.native, on: h.protection.on),
              SectionTitle(l.myWarnings),
              if (h.myAlerts.isEmpty) BodyText(l.noMyWarnings) else for (final a in h.myAlerts.take(10)) _MyAlertRow(alert: a, lang: lang),
            ]);
          },
        ),
      ],
    );
  }
}

/// The one bold element: a full-width band whose colour and sentence say how safe things are.
class StatusBand extends StatelessWidget {
  const StatusBand({super.key, required this.state, required this.home, required this.lang});
  final SafetyState state;
  final ProtectionHome home;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.safety;
    final names = home.activeGuardians.map((g) => g.displayName).join(', ');
    final latest = home.myAlerts.isEmpty ? null : home.myAlerts.first;
    final (color, icon, title, body) = switch (state) {
      SafetyState.protected => (c.safe, Icons.verified_user, l.statusProtected, l.statusProtectedBody(names)),
      SafetyState.warning => (c.warn, Icons.report_gmailerrorred, l.statusWarning, l.statusWarningBody(latest == null ? '' : formatClock(latest.occurredAt, lang))),
      SafetyState.paused => (c.danger, Icons.front_hand, l.statusPaused, l.statusPausedBody),
      SafetyState.off => (c.off, Icons.shield_outlined, l.statusOff, l.statusOffBody),
      SafetyState.noGuardian => (Theme.of(context).colorScheme.primary, Icons.diversity_1, l.statusNoGuardian, l.statusNoGuardianBody),
    };
    return Semantics(
      container: true,
      liveRegion: true,
      label: '$title. $body',
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(24)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 44, color: c.onBand),
            const Gap(14),
            Text(title, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: c.onBand)),
            const Gap(8),
            Text(body, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: c.onBand)),
          ]),
        ),
      ),
    );
  }
}

class _HelpButton extends StatelessWidget {
  const _HelpButton({required this.busy, required this.sent, required this.onPressed});
  final bool busy;
  final bool sent;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final danger = context.safety.danger;
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(foregroundColor: danger, side: BorderSide(color: danger, width: 2), minimumSize: const Size.fromHeight(64)),
        onPressed: busy ? null : onPressed,
        icon: busy ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 3)) : Icon(sent ? Icons.check : Icons.sos),
        label: Text(context.l10n.needHelp),
      ),
    );
  }
}

/// Plain rows, one per scam pattern, ticked when the phone can watch for it.
class _WatchList extends StatelessWidget {
  const _WatchList({required this.native, required this.on});
  final Map<String, bool> native;
  final bool on;

  bool _has(String k) => on && (native[k] ?? false);

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final rows = [
      (l.watchCodes, _has('notificationAccess') && (_has('accessibility') || _has('usageAccess'))),
      (l.watchFakeSites, _has('notificationAccess') || _has('autofill')),
      (l.watchScreens, _has('accessibility') || _has('usageAccess')),
      (l.watchPins, _has('deviceAdmin')),
      (l.watchMoney, _has('notificationAccess')),
      (l.watchCalls, _has('callScreening') || _has('phoneState')),
    ];
    final c = context.safety;
    return Column(children: [
      for (final (label, ready) in rows)
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(ready ? Icons.check_circle : Icons.radio_button_unchecked, color: ready ? c.safe : c.muted, semanticLabel: ready ? l.fpReady : l.watchNotReady),
          title: Text(label),
          subtitle: ready ? null : Text(l.watchNotReady),
          onTap: () => context.push('/protection'),
        ),
      if (rows.any((r) => !r.$2)) Align(alignment: AlignmentDirectional.centerStart, child: TextButton(onPressed: () => context.push('/protection'), child: Text(l.setUpProtection))),
    ]);
  }
}

class _MyAlertRow extends StatelessWidget {
  const _MyAlertRow({required this.alert, required this.lang});
  final MyAlert alert;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final c = context.safety;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Padding(padding: const EdgeInsets.only(top: 6), child: StateDot(color: alert.critical ? c.danger : c.warn)),
      title: Text(alert.reasons.isEmpty ? '' : alert.reasons.first.text),
      subtitle: Text(formatClock(alert.occurredAt, lang)),
    );
  }
}

/// A small coloured dot that carries a state next to text (never colour alone: text says it too).
class StateDot extends StatelessWidget {
  const StateDot({super.key, required this.color});
  final Color color;
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(width: 14, height: 14, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      );
}

/// Someone is moving this account to a new phone: say so loudly and offer to stop it.
class RecoveryBanner extends ConsumerStatefulWidget {
  const RecoveryBanner({super.key, required this.recovery, required this.onChanged});
  final ActiveRecovery recovery;
  final VoidCallback onChanged;
  @override
  ConsumerState<RecoveryBanner> createState() => _RecoveryBannerState();
}

class _RecoveryBannerState extends ConsumerState<RecoveryBanner> {
  bool _busy = false;
  AppFailure? _error;

  Future<void> _cancel() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).cancelRecovery(widget.recovery.id);
      if (mounted) showMessage(context, context.l10n.recoveryCancelled);
      widget.onChanged();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.safety;
    final body = l.recoveryBannerBody(widget.recovery.newDeviceName);
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(color: c.danger, borderRadius: BorderRadius.circular(24)),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.recoveryBannerTitle, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: c.onBand)),
            const Gap(6),
            Text(body, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: c.onBand)),
            SpeakButton(text: '${l.recoveryBannerTitle}. $body', autoSpeak: true),
            if (_error != null) FailureCard(failure: _error!),
            const Gap(8),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: c.onBand, foregroundColor: c.danger, minimumSize: const Size.fromHeight(58)),
              onPressed: _busy ? null : _cancel,
              child: Text(l.cancelRecovery),
            ),
          ]),
        ),
      ),
    );
  }
}
