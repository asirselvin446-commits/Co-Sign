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
import 'protection_tab.dart';

void refreshFamily(WidgetRef ref) => ref
  ..invalidate(peopleProvider)
  ..invalidate(inboxProvider)
  ..invalidate(alertsProvider)
  ..invalidate(guardianSigninsProvider);

/// The guardian's view: each person they protect, what needs an answer, and recent alerts.
class FamilyTab extends ConsumerWidget {
  const FamilyTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final people = ref.watch(peopleProvider);
    final inbox = ref.watch(inboxProvider);
    final alerts = ref.watch(alertsProvider);
    final signins = ref.watch(guardianSigninsProvider);
    return TabBody(
      onRefresh: () async {
        refreshFamily(ref);
        try {
          await ref.read(peopleProvider.future);
        } on Object {
          // Shown inline.
        }
      },
      children: [
        // Sign-in requests come first: someone is waiting at a login screen.
        ...switch (signins) {
          AsyncData(:final value) when value.isNotEmpty => [
              SectionTitle(l.signinRequests),
              for (final s in value) ...[_SigninRequestRow(request: s, lang: lang), const Gap(12)],
            ],
          _ => const <Widget>[],
        },
        AsyncBody<List<Person>>(
          value: people,
          onRetry: () => ref.invalidate(peopleProvider),
          builder: (list) => list.isEmpty
              ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  BodyText(l.familyEmpty),
                  const Gap(),
                  SecondaryButton(label: l.beGuardian, icon: Icons.volunteer_activism, onPressed: () => context.push('/guardian/accept')),
                ])
              : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  for (final p in list) ...[PersonCard(person: p, lang: lang), const Gap(14)],
                ]),
        ),
        AsyncBody<GuardianInbox>(
          value: inbox,
          onRetry: () => ref.invalidate(inboxProvider),
          builder: (box) => box.isEmpty
              ? const SizedBox.shrink()
              : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  SectionTitle(l.needsAnswer),
                  for (final r in box.requests) _RequestRow(request: r, lang: lang),
                  for (final r in box.recoveries)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.phonelink_lock),
                      title: Text(l.recoveryRequestTitle(r.requesterName)),
                      subtitle: Text(l.newPhone(r.newDeviceName)),
                      onTap: () => context.push('/guardian/recovery/${r.id}'),
                    ),
                ]),
        ),
        SectionTitle(l.alertsTitle),
        AsyncBody<List<GuardianAlert>>(
          value: alerts,
          onRetry: () => ref.invalidate(alertsProvider),
          builder: (list) => list.isEmpty ? BodyText(l.noAlerts) : Column(children: [for (final a in list.take(15)) AlertTile(alert: a)]),
        ),
      ],
    );
  }
}

/// One person: their state in words and colour, and the controls a guardian has.
class PersonCard extends ConsumerWidget {
  const PersonCard({super.key, required this.person, required this.lang});
  final Person person;
  final String lang;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final c = context.safety;
    final p = person.protection;
    final (Color color, String status) = !person.canAct
        ? (c.off, person.activatesAt == null ? person.status : l.personPending(formatDate(person.activatesAt!, lang)))
        : p == null || !p.on
            ? (c.off, l.personOff)
            : p.paused
                ? (c.danger, l.personPaused)
                : p.lastAlertAt != null && DateTime.now().difference(p.lastAlertAt!) < const Duration(hours: 24)
                    ? (p.lastAlertSeverity == 'critical' ? c.danger : c.warn, (p.lastAlertSeverity == 'critical' ? l.personUrgent : l.personWarning)(formatClock(p.lastAlertAt!, lang)))
                    : (c.safe, l.personProtected);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: person.canAct ? () => context.push('/guardian/person/${person.linkId}') : null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text(person.displayName, style: Theme.of(context).textTheme.headlineSmall)),
              if (person.canAct) const Icon(Icons.chevron_right),
            ]),
            const Gap(8),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(padding: const EdgeInsets.only(top: 6), child: StateDot(color: color)),
              const SizedBox(width: 10),
              Expanded(child: Text(status, style: Theme.of(context).textTheme.titleMedium)),
            ]),
            if (p?.lastSeenAt != null && p!.on)
              Padding(
                padding: const EdgeInsets.only(top: 4, left: 24),
                child: Text(l.personLastSeen(formatClock(p.lastSeenAt!, lang)), style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c.muted)),
              ),
            if (person.canAct && p != null && p.on) ...[const Gap(14), GuardianControls(person: person)],
          ]),
        ),
      ),
    );
  }
}

/// Pause / lock / let them continue, with plain confirmations. Shared by the Family tab and the
/// person screen.
class GuardianControls extends ConsumerStatefulWidget {
  const GuardianControls({super.key, required this.person, this.autoPause = false});
  final Person person;

  /// From the notification's "Pause their phone" button: act at once.
  final bool autoPause;

  @override
  ConsumerState<GuardianControls> createState() => _GuardianControlsState();
}

class _GuardianControlsState extends ConsumerState<GuardianControls> {
  bool _busy = false;
  AppFailure? _error;

  @override
  void initState() {
    super.initState();
    if (widget.autoPause) WidgetsBinding.instance.addPostFrameCallback((_) => _pause(confirm: false));
  }

  Future<void> _run(Future<void> Function() fn, String done) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await fn();
      if (mounted) showMessage(context, done);
      refreshFamily(ref);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pause({bool confirm = true}) async {
    final l = context.l10n;
    final name = widget.person.displayName;
    if (confirm && !await confirmDialog(context, l.pausePhoneConfirm(name), confirmLabel: l.pausePhone, danger: true)) return;
    await _run(() => ref.read(apiProvider).pausePhone(widget.person.linkId), l.phonePaused(name));
  }

  Future<void> _lock() async {
    final l = context.l10n;
    final name = widget.person.displayName;
    if (!await confirmDialog(context, l.lockPhoneConfirm(name), confirmLabel: l.lockPhone, danger: true)) return;
    await _run(() => ref.read(apiProvider).lockPhone(widget.person.linkId), l.phoneLocked(name));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.safety;
    final pauseId = widget.person.protection?.pauseId;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (pauseId != null)
        FilledButton.icon(
          onPressed: _busy ? null : () => _run(() => ref.read(apiProvider).releasePause(pauseId), l.letContinueDone(widget.person.displayName)),
          icon: const Icon(Icons.lock_open),
          label: Text(l.letContinue),
        )
      else
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: c.onBand),
          onPressed: _busy ? null : _pause,
          icon: const Icon(Icons.front_hand),
          label: Text(l.pausePhone),
        ),
      const Gap(10),
      OutlinedButton.icon(onPressed: _busy ? null : _lock, icon: const Icon(Icons.screen_lock_portrait), label: Text(l.lockPhone)),
      if (_error != null) ...[const Gap(10), FailureCard(failure: _error!)],
    ]);
  }
}

class _RequestRow extends StatelessWidget {
  const _RequestRow({required this.request, required this.lang});
  final GuardianRequest request;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final r = request;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            InkWell(
              onTap: () => context.push('/guardian/request/${r.id}'),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l.approveTitle(r.requesterName), style: Theme.of(context).textTheme.titleLarge),
                const Gap(4),
                BodyText(r.actionLabel),
                Text(l.receivedAt(formatClock(r.createdAt, lang)), style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.safety.muted)),
              ]),
            ),
            const Gap(12),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => context.push('/guardian/request/${r.id}?act=deny'), child: Text(l.deny))),
              const SizedBox(width: 12),
              Expanded(child: FilledButton(onPressed: () => context.push('/guardian/request/${r.id}?act=approve'), child: Text(l.approve))),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _SigninRequestRow extends StatelessWidget {
  const _SigninRequestRow({required this.request, required this.lang});
  final SigninRequestView request;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final r = request;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InkWell(
            onTap: () => context.push('/guardian/signin/${r.id}'),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.guardianSigninTitle(r.personName, r.target.display), style: Theme.of(context).textTheme.titleLarge),
              const Gap(4),
              for (final reason in r.reasons.take(2)) BodyText(reason),
              Text(l.receivedAt(formatClock(r.createdAt, lang)), style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.safety.muted)),
            ]),
          ),
          const Gap(12),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => context.push('/guardian/signin/${r.id}?act=deny'), child: Text(l.deny))),
            const SizedBox(width: 12),
            Expanded(child: FilledButton(onPressed: () => context.push('/guardian/signin/${r.id}?act=fill'), child: Text(l.signinFill))),
          ]),
        ]),
      ),
    );
  }
}
