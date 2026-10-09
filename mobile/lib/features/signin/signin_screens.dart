import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/security/device_lock.dart';
import '../../l10n/gen/app_localizations.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../home/protection_tab.dart' show StateDot;
import 'vault.dart';

final autofillStatusProvider = FutureProvider.autoDispose<({bool supported, bool enabled})>((ref) => ref.watch(signalsChannelProvider).autofillStatus());
final mySigninsProvider = FutureProvider.autoDispose<List<MySignin>>((ref) => ref.watch(apiProvider).mySignins());
final guardianSigninsProvider = FutureProvider.autoDispose<List<SigninRequestView>>((ref) => ref.watch(apiProvider).guardianSignins());

/// "Filled by Ravi", "Ravi said no", "Waiting for an answer"...
String signinStatusText(AppLocalizations l, String status, String? guardian) => switch (status) {
      'filled' || 'delivered' => l.signinFilledBy(guardian ?? ''),
      'denied' => l.signinDeniedBy(guardian ?? ''),
      'pending' => l.signinWaitingShort,
      _ => l.signinNoAnswer,
    };

// ----------------------------------------------------------------------------- the person

/// Protection tab: set up and use guardian-assisted sign-in.
class SignInHelpCard extends ConsumerWidget {
  const SignInHelpCard({super.key, required this.protectionOn, required this.status, required this.recent});
  final bool protectionOn;
  final AsyncValue<({bool supported, bool enabled})> status;
  final AsyncValue<List<MySignin>> recent;

  Future<void> _pickApp(BuildContext context, WidgetRef ref) async {
    final l = context.l10n;
    final channel = ref.read(signalsChannelProvider);
    final apps = await channel.signInApps();
    if (!context.mounted) return;
    final picked = await showModalBottomSheet<({String package, String label, String category})>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          Text(l.signinPickApp, style: Theme.of(c).textTheme.titleLarge),
          const Gap(8),
          if (apps.isEmpty) BodyText(l.signinNoApps),
          for (final a in apps) ListTile(leading: const Icon(Icons.apps), title: Text(a.label), onTap: () => Navigator.pop(c, a)),
        ]),
      ),
    );
    if (picked != null) await channel.startShowSignIn(picked.package, picked.label);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final s = status.value;
    if (s != null && !s.supported) return const SizedBox.shrink();
    final ready = s?.enabled ?? false;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(Icons.key_rounded, size: 30, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(child: Text(l.signinCardTitle, style: Theme.of(context).textTheme.titleLarge)),
          ]),
          const Gap(10),
          BodyText(ready ? l.signinCardOn : l.signinCardOff),
          const Gap(12),
          if (!ready)
            PrimaryButton(
              label: l.signinTurnOn,
              icon: Icons.toggle_on,
              onPressed: () async {
                await ref.read(signalsChannelProvider).openAutofillSettings();
                ref.invalidate(autofillStatusProvider);
              },
            ),
          if (protectionOn) ...[
            if (!ready) const Gap(10),
            SecondaryButton(label: l.signinWithHelp, icon: Icons.lock_open, onPressed: () => _pickApp(context, ref)),
            const Gap(6),
            Text(l.signinWithHelpBody, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.safety.muted)),
          ],
          ...switch (recent) {
            AsyncData(:final value) when value.isNotEmpty => [
                const Gap(12),
                Text(l.recentSignins, style: Theme.of(context).textTheme.titleMedium),
                for (final r in value.take(3))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.login),
                    title: Text(r.target.display),
                    subtitle: Text('${signinStatusText(l, r.status, r.guardianName)} · ${formatClock(r.createdAt, lang)}'),
                  ),
              ],
            _ => const <Widget>[],
          },
        ]),
      ),
    );
  }
}

// ----------------------------------------------------------------------------- the guardian

/// A sign-in request from someone I guard. From the notification's Fill or Deny button ([act])
/// it starts at once: one fingerprint, and the password is sealed to their phone and filled.
class GuardianSigninScreen extends ConsumerStatefulWidget {
  const GuardianSigninScreen({super.key, required this.signinId, this.act});
  final String signinId;
  final String? act;
  @override
  ConsumerState<GuardianSigninScreen> createState() => _GuardianSigninScreenState();
}

class _GuardianSigninScreenState extends ConsumerState<GuardianSigninScreen> {
  SigninRequestView? _req;
  List<SavedSignin> _saved = const [];
  SavedSignin? _use;
  bool _typing = false;
  bool _save = true;
  bool _allowShow = false;
  bool _siteConfirmed = false;
  bool _busy = false;
  String? _done;
  AppFailure? _error;
  bool _acted = false;
  final _label = TextEditingController();
  final _user = TextEditingController();
  final _pass = TextEditingController();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _label.dispose();
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await ref.read(apiProvider).guardianSignin(widget.signinId);
      final saved = r.personLinkId == null ? const <SavedSignin>[] : await ref.read(vaultProvider).list(r.personLinkId!);
      if (!mounted) return;
      final match = saved.where((s) => s.matches(r.target)).firstOrNull;
      setState(() {
        _req = r;
        _saved = saved;
        _use = match;
        _typing = match == null;
        _label.text = r.target.display;
      });
      // From the notification: Deny at once; Fill at once when a saved sign-in matches and no extra
      // confirmation is needed.
      if (!_acted && r.open && widget.act == 'deny') {
        _acted = true;
        unawaited(_answer('deny'));
      } else if (!_acted && r.open && widget.act == 'fill' && match != null && r.mode == 'fill' && r.target.verdict != 'suspicious') {
        _acted = true;
        unawaited(_answer('fill'));
      }
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  bool get _canFill {
    final r = _req;
    if (r == null || !r.open || _busy) return false;
    if (r.target.verdict == 'suspicious' && !_siteConfirmed) return false;
    if (r.mode == 'show' && !_allowShow) return false;
    if (_typing) return _pass.text.isNotEmpty;
    return _use != null && !_use!.conflicts(r.target);
  }

  Future<void> _answer(String decision) async {
    final r = _req!;
    final l = context.l10n;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      String? sealed;
      SavedSignin? toSave;
      if (decision == 'fill') {
        // Only the guardian can send it: their own fingerprint, face or phone PIN. Saying no needs nothing.
        await ref.read(deviceLockProvider).confirm(l.signinConfirmLock(r.personName));
        final user = _typing ? _user.text.trim() : _use!.username;
        final pass = _typing ? _pass.text : _use!.password;
        sealed = await ref.read(signalsChannelProvider).signinSeal(
              publicKey: r.publicKey!,
              plaintext: jsonEncode({'u': user, 'p': pass}),
              requestId: r.id,
              package: r.target.package,
              host: r.target.host,
            );
        if (_typing && _save && r.personLinkId != null) {
          toSave = SavedSignin(id: SigninVault.newId(), label: _label.text.trim().isEmpty ? r.target.display : _label.text.trim(), packages: const [], domains: const [], username: user, password: pass).boundTo(r.target);
        } else if (!_typing && _use!.unbound && r.personLinkId != null) {
          toSave = _use!.boundTo(r.target);
        }
      }
      await api.signinAnswer(r.id, decision, sealed);
      if (toSave != null) await ref.read(vaultProvider).save(r.personLinkId!, toSave);
      _pass.clear();
      ref.invalidate(guardianSigninsProvider);
      if (mounted) {
        setState(() => _done = decision == 'deny' ? l.signinDeniedDone(r.personName) : (r.mode == 'show' ? l.signinShown(r.personName) : l.signinFilled(r.personName)));
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
    final lang = ref.watch(settingsProvider).language;
    final r = _req;
    if (r == null) return AppPage(title: l.signinRequests, children: [if (_error != null) FailureCard(failure: _error!, onRetry: _load) else const LoadingView()]);
    final c = context.safety;
    final open = r.open && _done == null;
    final verdictText = switch (r.target.verdict) {
      'official' => l.signinVerdictOfficial,
      'suspicious' => l.signinVerdictSuspicious,
      'unknown' => l.signinVerdictUnknown,
      _ => l.signinVerdictApp,
    };
    final verdictColor = switch (r.target.verdict) {
      'official' || 'app' => c.safe,
      'suspicious' => c.danger,
      _ => c.warn,
    };
    final offered = _saved.where((s) => !s.conflicts(r.target)).toList();
    return AppPage(
      title: l.signinRequests,
      bottom: open
          ? Column(mainAxisSize: MainAxisSize.min, children: [
              // Right above the buttons, so the guardian sees why nothing was sent.
              if (_error != null) ...[FailureCard(failure: _error!), const Gap(10)],
              PrimaryButton(label: r.mode == 'show' ? l.signinShowButton : l.signinFill, icon: Icons.key, busy: _busy, onPressed: _canFill ? () => _answer('fill') : null),
              const Gap(10),
              SecondaryButton(label: l.deny, icon: Icons.block, onPressed: _busy ? null : () => _answer('deny')),
            ])
          : PrimaryButton(label: l.close, onPressed: () => context.canPop() ? context.pop() : context.go('/home?tab=family')),
      children: [
        Semantics(header: true, child: Text(l.guardianSigninTitle(r.personName, r.target.display), style: Theme.of(context).textTheme.headlineSmall)),
        const Gap(8),
        BodyText(r.target.isWebsite ? l.signinWebsite(r.target.host ?? '') : l.signinAppName(r.target.appLabel)),
        if (r.target.package != null && !r.target.isWebsite) Text(r.target.package!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c.muted)),
        BodyText(l.receivedAt(formatClock(r.createdAt, lang))),
        const Gap(10),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 6), child: StateDot(color: verdictColor)),
          const SizedBox(width: 10),
          Expanded(child: BodyText(verdictText, emphasis: r.target.verdict == 'suspicious')),
        ]),
        if (r.reasons.isNotEmpty) ...[
          SectionTitle(l.whyPaused),
          for (final reason in r.reasons) ...[BodyText('• $reason'), const Gap(4)],
        ],
        const Gap(10),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(l.callFirst(r.personName), emphasis: true))),
        if (open) ...[
          const Gap(),
          if (!_typing && _use != null) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.verified_user),
              title: Text(l.savedSigninLabel(_use!.label)),
              subtitle: Text(_use!.username),
            ),
            TextButton(onPressed: () => setState(() => _typing = true), child: Text(l.useAnotherSignin)),
          ] else ...[
            for (final s in offered.where((s) => s.unbound))
              ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.key_outlined), title: Text(s.label), subtitle: Text(s.username), onTap: () => setState(() {
                    _use = s;
                    _typing = false;
                  })),
            TextField(controller: _user, decoration: InputDecoration(labelText: l.signinUsername), autocorrect: false, enableSuggestions: false),
            const Gap(12),
            TextField(controller: _pass, decoration: InputDecoration(labelText: l.signinPassword), obscureText: true, autocorrect: false, enableSuggestions: false, onChanged: (_) => setState(() {})),
            if (r.personLinkId != null)
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: _save, onChanged: (v) => setState(() => _save = v ?? false), title: Text(l.signinSave), subtitle: Text(l.signinSaveNote)),
          ],
          if (r.target.verdict == 'suspicious')
            CheckboxListTile(contentPadding: EdgeInsets.zero, value: _siteConfirmed, onChanged: (v) => setState(() => _siteConfirmed = v ?? false), title: Text(l.signinConfirmSite)),
          if (r.mode == 'show') CheckboxListTile(contentPadding: EdgeInsets.zero, value: _allowShow, onChanged: (v) => setState(() => _allowShow = v ?? false), title: Text(l.signinAllowShow)),
        ],
        if (_done != null) ...[const Gap(), Semantics(liveRegion: true, child: BodyText(_done!, emphasis: true))],
        if (!r.open && _done == null) ...[const Gap(), BodyText(l.signinClosed, emphasis: true)],
        if (_error != null && !open) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}

/// Sign-ins a guardian keeps for one person (on the guardian's phone only).
class SavedSigninsScreen extends ConsumerStatefulWidget {
  const SavedSigninsScreen({super.key, required this.linkId, required this.personName});
  final String linkId;
  final String personName;
  @override
  ConsumerState<SavedSigninsScreen> createState() => _SavedSigninsScreenState();
}

class _SavedSigninsScreenState extends ConsumerState<SavedSigninsScreen> {
  Future<void> _add() async {
    final l = context.l10n;
    final label = TextEditingController();
    final user = TextEditingController();
    final pass = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(l.addSavedSignin),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: label, decoration: InputDecoration(labelText: l.signinLabelField)),
            const Gap(10),
            TextField(controller: user, decoration: InputDecoration(labelText: l.signinUsername), autocorrect: false),
            const Gap(10),
            TextField(controller: pass, decoration: InputDecoration(labelText: l.signinPassword), obscureText: true, autocorrect: false),
            const Gap(8),
            Text(l.signinSaveNote, style: Theme.of(c).textTheme.bodySmall),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(l.done)),
        ],
      ),
    );
    if (ok == true && pass.text.isNotEmpty && label.text.trim().isNotEmpty) {
      await ref.read(vaultProvider).save(
            widget.linkId,
            SavedSignin(id: SigninVault.newId(), label: label.text.trim(), packages: const [], domains: const [], username: user.text.trim(), password: pass.text),
          );
      ref.invalidate(savedSigninsProvider(widget.linkId));
    }
    label.dispose();
    user.dispose();
    pass.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final saved = ref.watch(savedSigninsProvider(widget.linkId));
    return AppPage(
      title: '${l.savedSignins}: ${widget.personName}',
      bottom: PrimaryButton(label: l.addSavedSignin, icon: Icons.add, onPressed: _add),
      children: [
        AsyncBody<List<SavedSignin>>(
          value: saved,
          onRetry: () => ref.invalidate(savedSigninsProvider(widget.linkId)),
          builder: (list) => list.isEmpty
              ? BodyText(l.savedSigninsEmpty)
              : Column(children: [
                  for (final s in list)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.key),
                      title: Text(s.label),
                      subtitle: Text([s.username, if (s.unbound) l.savedSigninAny else l.savedSigninFor([...s.domains, ...s.packages].join(', '))].where((x) => x.isNotEmpty).join('\n')),
                      isThreeLine: true,
                      trailing: IconButton(
                        tooltip: l.deleteSignin,
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          if (!await confirmDialog(context, l.deleteSigninConfirm, confirmLabel: l.deleteSignin, danger: true)) return;
                          await ref.read(vaultProvider).delete(widget.linkId, s.id);
                          ref.invalidate(savedSigninsProvider(widget.linkId));
                        },
                      ),
                    ),
                ]),
        ),
      ],
    );
  }
}

// ----------------------------------------------------------------------------- check a link

/// Paste or share a message or link; Co-Sign checks it on the phone with the shared rules.
class CheckLinkScreen extends ConsumerStatefulWidget {
  const CheckLinkScreen({super.key, this.initialText});
  final String? initialText;
  @override
  ConsumerState<CheckLinkScreen> createState() => _CheckLinkScreenState();
}

class _CheckLinkScreenState extends ConsumerState<CheckLinkScreen> {
  late final _text = TextEditingController(text: widget.initialText ?? '');
  LinkCheck? _result;
  bool _told = false;

  @override
  void initState() {
    super.initState();
    if ((widget.initialText ?? '').isNotEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final t = _text.text.trim();
    if (t.isEmpty) return;
    final r = await ref.read(signalsChannelProvider).analyzeText(t);
    if (mounted) {
      setState(() {
        _result = r;
        _told = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.safety;
    final r = _result;
    final worst = r?.worst;
    final (Color? color, String? title, String? body) = switch (r) {
      null => (null, null, null),
      _ when worst != null && worst.fake => (c.danger, l.checkFake, l.checkFakeBody(worst.domain ?? worst.host ?? '', worst.brandName ?? '')),
      _ when r.scam => (c.danger, l.checkScam, l.checkScamBody),
      _ when worst != null && worst.risky => (c.warn, l.checkRisky, l.checkRiskyBody(worst.domain ?? worst.host ?? 'upi://')),
      _ when worst != null && worst.official => (c.safe, l.checkOfficial(worst.brandName ?? worst.domain ?? ''), null),
      _ when worst != null => (c.off, l.checkUnknown, l.checkUnknownBody),
      _ => (c.safe, l.checkNothing, null),
    };
    final worrying = r != null && (r.scam || (worst != null && (worst.fake || worst.risky)));
    return AppPage(
      title: l.checkLink,
      children: [
        TextField(controller: _text, minLines: 3, maxLines: 8, decoration: InputDecoration(labelText: l.checkLinkHint)),
        const Gap(8),
        Text(l.checkLinkNote, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c.muted)),
        const Gap(12),
        PrimaryButton(label: l.checkLinkButton, icon: Icons.search, onPressed: _check),
        if (r != null && title != null) ...[
          const Gap(),
          Semantics(
            liveRegion: true,
            container: true,
            child: DecoratedBox(
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(20)),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: c.onBand)),
                  if (body != null) ...[const Gap(8), Text(body, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: c.onBand))],
                ]),
              ),
            ),
          ),
          if (worrying) ...[
            const Gap(12),
            if (_told)
              BodyText(l.toldGuardian, emphasis: true)
            else
              SecondaryButton(
                label: l.tellGuardian,
                icon: Icons.send,
                onPressed: () async {
                  await ref.read(signalsChannelProvider).reportScamText(_text.text);
                  if (mounted) setState(() => _told = true);
                },
              ),
          ],
        ],
      ],
    );
  }
}
