import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/cosign_api.dart';
import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/signals/signal_collector.dart';
import '../../generated/catalog.g.dart';
import '../../ui/money.dart';
import '../../ui/widgets.dart';
import '../home/home_screen.dart';
import '../stepup/stepup_flow.dart';

final payeesProvider = FutureProvider.autoDispose<List<Payee>>((ref) => ref.watch(apiProvider).payees());
final accountProvider = FutureProvider.autoDispose<Account>((ref) => ref.watch(apiProvider).account());

class TransferScreen extends ConsumerStatefulWidget {
  const TransferScreen({super.key});
  @override
  ConsumerState<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends ConsumerState<TransferScreen> {
  final _amount = TextEditingController();
  final _memo = TextEditingController();
  Payee? _payee;
  bool _busy = false;
  AppFailure? _error;
  String? _amountError;
  // One key per intended transfer: retries after a network error cannot send twice.
  String _idempotencyKey = newIdempotencyKey();
  SensitiveSession? _session;

  @override
  void initState() {
    super.initState();
    _session = SensitiveSession(collector: ref.read(signalCollectorProvider), api: ref.read(apiProvider));
    _session!.start();
  }

  @override
  void dispose() {
    _session?.stop();
    _amount.dispose();
    _memo.dispose();
    super.dispose();
  }

  Future<void> _send(Account account) async {
    final l = context.l10n;
    final amount = parseAmount(_amount.text);
    setState(() {
      _amountError = amount == null ? l.invalidAmount : null;
      _error = null;
    });
    if (amount == null || _payee == null) return;
    setState(() => _busy = true);
    final lang = ref.read(settingsProvider).language;
    final memo = _memo.text.trim();
    try {
      if (amount > account.remainingTodayMinor) {
        final done = await runSensitiveAction(context, ref, 'transfer_above_limit', {
          'payeeId': _payee!.id,
          'amountMinor': amount.toString(),
          if (memo.isNotEmpty) 'memo': memo,
          'idempotencyKey': _idempotencyKey,
        });
        if (done?.status != StepupStatus.completed) return;
      } else {
        await ref.read(apiProvider).transfer(payeeId: _payee!.id, amountMinor: amount, memo: memo, idempotencyKey: _idempotencyKey);
      }
      _idempotencyKey = newIdempotencyKey();
      ref.invalidate(homeProvider);
      if (!mounted) return;
      showMessage(context, l.sentSuccess(formatMoney(amount, account.currency, lang), _payee!.nickname));
      context.pop();
    } on AppFailure catch (f) {
      if (f.code == ErrorCodes.LIMIT_STEPUP_REQUIRED) ref.invalidate(accountProvider);
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final payees = ref.watch(payeesProvider);
    final account = ref.watch(accountProvider);
    return AppPage(
      title: l.transferTitle,
      bottom: account.hasValue ? PrimaryButton(label: l.send, icon: Icons.send, busy: _busy, onPressed: () => _send(account.requireValue)) : null,
      children: [
        AsyncBody<List<Payee>>(
          value: payees,
          onRetry: () => ref.invalidate(payeesProvider),
          builder: (list) => list.isEmpty
              ? Column(children: [BodyText(l.noPayees), const Gap(), SecondaryButton(label: l.addPayee, onPressed: () => context.push('/payees/add'))])
              : DropdownButtonFormField<Payee>(
                  initialValue: _payee,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.toPayee),
                  hint: Text(l.choosePayee),
                  items: [for (final p in list) DropdownMenuItem(value: p, child: Text('${p.nickname} (@${p.handle})', overflow: TextOverflow.ellipsis))],
                  onChanged: (p) => setState(() => _payee = p),
                ),
        ),
        const Gap(),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: l.amountLabel, hintText: l.amountHint, errorText: _amountError),
          style: const TextStyle(fontSize: 24),
          inputFormatters: [PasteDetectingFormatter(ref.read(pasteTrackerProvider)), LengthLimitingTextInputFormatter(18)],
          onChanged: (_) => setState(() {}),
        ),
        const Gap(),
        TextField(controller: _memo, decoration: InputDecoration(labelText: l.memoLabel), inputFormatters: [LengthLimitingTextInputFormatter(140)]),
        const Gap(),
        AsyncBody<Account>(
          value: account,
          builder: (a) {
            final amount = parseAmount(_amount.text);
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              BodyText(l.remainingToday(formatMoney(a.remainingTodayMinor, a.currency, lang))),
              if (amount != null && amount > a.remainingTodayMinor) ...[const Gap(8), BodyText(l.aboveLimitNote, emphasis: true)],
            ]);
          },
        ),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}

class PayeesScreen extends ConsumerWidget {
  const PayeesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final payees = ref.watch(payeesProvider);
    return AppPage(
      title: l.payeesTitle,
      bottom: PrimaryButton(label: l.addPayee, icon: Icons.person_add, onPressed: () => context.push('/payees/add')),
      children: [
        AsyncBody<List<Payee>>(
          value: payees,
          onRetry: () => ref.invalidate(payeesProvider),
          builder: (list) => list.isEmpty
              ? BodyText(l.noPayees)
              : Column(children: [
                  for (final p in list)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.person),
                      title: Text(p.nickname),
                      subtitle: Text('@${p.handle} · ${p.displayName}'),
                      trailing: IconButton(
                        tooltip: '${l.remove} ${p.nickname}',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          if (!await confirmDialog(context, '${l.remove} ${p.nickname}?', danger: true)) return;
                          await ref.read(apiProvider).removePayee(p.id);
                          ref.invalidate(payeesProvider);
                        },
                      ),
                    ),
                ]),
        ),
      ],
    );
  }
}

class AddPayeeScreen extends ConsumerStatefulWidget {
  const AddPayeeScreen({super.key});
  @override
  ConsumerState<AddPayeeScreen> createState() => _AddPayeeScreenState();
}

class _AddPayeeScreenState extends ConsumerState<AddPayeeScreen> {
  final _handle = TextEditingController();
  final _nickname = TextEditingController();
  bool _busy = false;
  AppFailure? _error;

  @override
  void dispose() {
    _handle.dispose();
    _nickname.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final handle = _handle.text.trim().toLowerCase().replaceFirst('@', '');
      final done = await runSensitiveAction(context, ref, 'add_payee', {'handle': handle, 'nickname': _nickname.text.trim().isEmpty ? handle : _nickname.text.trim()});
      if (done?.status == StepupStatus.completed && mounted) {
        ref.invalidate(payeesProvider);
        showMessage(context, context.l10n.payeeAdded);
        context.pop();
      }
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AppPage(
      title: l.addPayee,
      bottom: PrimaryButton(label: l.continueLabel, busy: _busy, onPressed: _add),
      children: [
        TextField(
          controller: _handle,
          decoration: InputDecoration(labelText: l.payeeHandle, prefixText: '@'),
          autocorrect: false,
          inputFormatters: [PasteDetectingFormatter(ref.read(pasteTrackerProvider)), LengthLimitingTextInputFormatter(31)],
        ),
        const Gap(),
        TextField(controller: _nickname, decoration: InputDecoration(labelText: l.payeeNickname), inputFormatters: [LengthLimitingTextInputFormatter(40)]),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}
