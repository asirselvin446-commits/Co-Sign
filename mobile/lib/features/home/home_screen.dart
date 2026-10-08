import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/session/session_controller.dart';
import '../../ui/money.dart';
import '../../ui/widgets.dart';

class HomeData {
  const HomeData(this.account, this.activity, this.recovery, this.openChecks, this.inbox);
  final Account account;
  final List<ActivityItem> activity;
  final ActiveRecovery? recovery;
  final List<StepupView> openChecks;
  final GuardianInbox inbox;
}

final homeProvider = FutureProvider.autoDispose<HomeData>((ref) async {
  final api = ref.watch(apiProvider);
  final results = await Future.wait<Object?>([
    api.account(),
    api.activity(),
    api.activeRecovery(),
    api.openStepups(),
    api.inbox(),
  ]);
  return HomeData(
    results[0]! as Account,
    results[1]! as List<ActivityItem>,
    results[2] as ActiveRecovery?,
    results[3]! as List<StepupView>,
    results[4]! as GuardianInbox,
  );
});

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  StreamSubscription<Object>? _events;

  @override
  void initState() {
    super.initState();
    const refreshOn = {'account.updated', 'recovery.alert', 'recovery.updated', 'stepup.updated', 'guardian.request', 'guardian.request.closed', 'guardian.recovery'};
    _events = ref.read(realtimeProvider).events.where((e) => refreshOn.contains(e.name)).listen((_) => ref.invalidate(homeProvider));
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final user = ref.watch(sessionProvider).user;
    final home = ref.watch(homeProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(user?.displayName ?? l.homeTitle),
        actions: [IconButton(tooltip: l.settings, icon: const Icon(Icons.settings), onPressed: () => context.push('/settings'))],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(homeProvider.future),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                children: [
                  AsyncBody<HomeData>(
                    value: home,
                    onRetry: () => ref.invalidate(homeProvider),
                    builder: (d) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (d.recovery != null) _RecoveryBanner(recovery: d.recovery!),
                      for (final c in d.openChecks)
                        Card(
                          child: ListTile(
                            leading: const Icon(Icons.shield_outlined),
                            title: Text(l.openCheck),
                            subtitle: Text(c.actionLabel),
                            trailing: Text(l.openCheckAction),
                            onTap: () => context.push('/stepup/${c.id}'),
                          ),
                        ),
                      if (!d.inbox.isEmpty)
                        Card(
                          color: Theme.of(context).colorScheme.tertiaryContainer,
                          child: ListTile(
                            leading: const Icon(Icons.notifications_active),
                            title: Text(l.guardianRequests),
                            trailing: Text('${d.inbox.requests.length + d.inbox.recoveries.length}'),
                            onTap: () => context.push('/guardian/inbox'),
                          ),
                        ),
                      const Gap(8),
                      Semantics(
                        container: true,
                        label: '${l.balance}: ${formatMoney(d.account.balanceMinor, d.account.currency, lang)}',
                        excludeSemantics: true,
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(l.balance, style: Theme.of(context).textTheme.titleMedium),
                              const Gap(4),
                              Text(formatMoney(d.account.balanceMinor, d.account.currency, lang), style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                              const Gap(8),
                              Text(l.remainingToday(formatMoney(d.account.remainingTodayMinor, d.account.currency, lang))),
                            ]),
                          ),
                        ),
                      ),
                      const Gap(),
                      PrimaryButton(label: l.sendMoney, icon: Icons.send, onPressed: () => context.push('/transfer')),
                      const Gap(12),
                      _NavGrid(),
                      SectionTitle(l.recentActivity),
                      if (d.activity.isEmpty) BodyText(l.noActivity),
                      for (final a in d.activity) _ActivityTile(item: a, lang: lang),
                    ]),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = [
      (Icons.people_alt, l.payees, '/payees'),
      (Icons.health_and_safety, l.guardians, '/guardians'),
      (Icons.phone_android, l.phones, '/devices'),
      (Icons.inbox, l.guardianRequests, '/guardian/inbox'),
      (Icons.shield_moon, l.familyProtection, '/protection'),
    ];
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        for (final (icon, label, route) in items)
          SizedBox(
            width: (MediaQuery.sizeOf(context).width.clamp(0, 640) - 52) / 2,
            child: OutlinedButton.icon(onPressed: () => context.push(route), icon: Icon(icon), label: Text(label, textAlign: TextAlign.center)),
          ),
      ],
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.item, required this.lang});
  final ActivityItem item;
  final String lang;
  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final amount = formatMoney(item.amountMinor, item.currency, lang);
    final who = item.counterpartyName.isEmpty ? item.counterpartyHandle : item.counterpartyName;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(item.outgoing ? Icons.north_east : Icons.south_west),
      title: Text(item.outgoing ? l.sentTo(who) : l.receivedFrom(who)),
      subtitle: Text([formatClock(item.createdAt, lang), if (item.memo != null) item.memo!].join(' · ')),
      trailing: Text('${item.outgoing ? '−' : '+'}$amount', style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }
}

class _RecoveryBanner extends ConsumerStatefulWidget {
  const _RecoveryBanner({required this.recovery});
  final ActiveRecovery recovery;
  @override
  ConsumerState<_RecoveryBanner> createState() => _RecoveryBannerState();
}

class _RecoveryBannerState extends ConsumerState<_RecoveryBanner> {
  bool _busy = false;
  AppFailure? _error;

  Future<void> _cancel() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).cancelRecovery(widget.recovery.id);
      if (mounted) showMessage(context, context.l10n.recoveryCancelled);
      ref.invalidate(homeProvider);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    final body = l.recoveryBannerBody(widget.recovery.newDeviceName);
    return Semantics(
      liveRegion: true,
      child: Card(
        color: scheme.errorContainer,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.recoveryBannerTitle, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: scheme.onErrorContainer)),
            const Gap(6),
            Text(body, style: TextStyle(color: scheme.onErrorContainer, fontSize: 16)),
            SpeakButton(text: '${l.recoveryBannerTitle}. $body', autoSpeak: true),
            if (_error != null) FailureCard(failure: _error!),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError, minimumSize: const Size.fromHeight(56)),
              onPressed: _busy ? null : _cancel,
              child: Text(l.cancelRecovery),
            ),
          ]),
        ),
      ),
    );
  }
}
