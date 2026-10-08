import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/signals/signal_collector.dart';
import '../../ui/widgets.dart';
import '../stepup/stepup_flow.dart';

final guardiansProvider = FutureProvider.autoDispose<GuardianList>((ref) => ref.watch(apiProvider).guardians());
final peopleProvider = FutureProvider.autoDispose<List<Person>>((ref) => ref.watch(apiProvider).people());

class GuardiansScreen extends ConsumerStatefulWidget {
  const GuardiansScreen({super.key});
  @override
  ConsumerState<GuardiansScreen> createState() => _GuardiansScreenState();
}

class _GuardiansScreenState extends ConsumerState<GuardiansScreen> {
  AppFailure? _error;
  StreamSubscription<Object>? _events;

  @override
  void initState() {
    super.initState();
    _events = ref.read(realtimeProvider).events.where((e) => e.name == 'guardians.changed').listen((_) => ref.invalidate(guardiansProvider));
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    super.dispose();
  }

  Future<void> _guard(Future<void> Function() fn) async {
    setState(() => _error = null);
    try {
      await fn();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final data = ref.watch(guardiansProvider);
    return AppPage(
      title: l.guardiansTitle,
      bottom: PrimaryButton(label: l.inviteGuardian, icon: Icons.person_add, onPressed: () => context.push('/guardians/invite')),
      children: [
        BodyText(l.guardiansIntro),
        const Gap(8),
        BodyText(l.changesTakeADay),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
        const Gap(),
        AsyncBody<GuardianList>(
          value: data,
          onRetry: () => ref.invalidate(guardiansProvider),
          builder: (g) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (g.guardians.isEmpty) BodyText(l.noGuardians, emphasis: true),
            for (final x in g.guardians)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.shield),
                      title: Text(x.displayName),
                      subtitle: Text(switch (x.status) {
                        'pending_activation' => l.pendingActivation(formatDate(x.activatesAt!, lang)),
                        'pending_removal' => l.pendingRemoval(formatDate(x.removesAt!, lang)),
                        _ => l.activeGuardian,
                      }),
                    ),
                    if (x.status != 'active')
                      SecondaryButton(
                        label: l.stopChange,
                        onPressed: () => _guard(() async {
                          await ref.read(apiProvider).cancelGuardianChange(x.linkId);
                          ref.invalidate(guardiansProvider);
                        }),
                      )
                    else
                      SecondaryButton(
                        label: l.remove,
                        danger: true,
                        onPressed: () => _guard(() async {
                          await runSensitiveAction(context, ref, 'remove_guardian', {'linkId': x.linkId});
                          ref.invalidate(guardiansProvider);
                        }),
                      ),
                  ]),
                ),
              ),
            const Gap(8),
            Text(l.guardiansMax(g.max)),
          ]),
        ),
      ],
    );
  }
}

class InviteGuardianScreen extends ConsumerStatefulWidget {
  const InviteGuardianScreen({super.key});
  @override
  ConsumerState<InviteGuardianScreen> createState() => _InviteGuardianScreenState();
}

class _InviteGuardianScreenState extends ConsumerState<InviteGuardianScreen> {
  late final Future<InviteInfo> _invite = ref.read(apiProvider).createInvite();

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    return AppPage(
      title: l.inviteTitle,
      children: [
        BodyText(l.inviteBody),
        const Gap(),
        FutureBuilder<InviteInfo>(
          future: _invite,
          builder: (c, snap) {
            if (snap.hasError) return FailureCard(failure: snap.error is AppFailure ? snap.error! as AppFailure : AppFailure('INTERNAL_ERROR'));
            if (!snap.hasData) return const LoadingView();
            final i = snap.data!;
            return Column(children: [
              Center(
                child: Container(
                  color: Colors.white,
                  padding: const EdgeInsets.all(12),
                  child: QrImageView(data: i.url, size: 240, semanticsLabel: l.scanQr),
                ),
              ),
              const Gap(),
              Text(l.inviteCode, style: Theme.of(context).textTheme.titleMedium),
              SelectableText(
                '${i.code.substring(0, 4)} ${i.code.substring(4)}',
                style: Theme.of(context).textTheme.displaySmall?.copyWith(letterSpacing: 6, fontWeight: FontWeight.w700),
                semanticsLabel: i.code.split('').join(' '),
              ),
              Text(l.expires(formatDate(i.expiresAt, lang))),
              const Gap(),
              SecondaryButton(
                label: l.shareLink,
                icon: Icons.copy,
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: i.url));
                  if (context.mounted) showMessage(context, l.linkCopied);
                },
              ),
            ]);
          },
        ),
      ],
    );
  }
}

/// Guardian side: accept an invite from a link (deep link token), QR scan or the 8-digit code.
class BecomeGuardianScreen extends ConsumerStatefulWidget {
  const BecomeGuardianScreen({super.key, this.token});
  final String? token;
  @override
  ConsumerState<BecomeGuardianScreen> createState() => _BecomeGuardianScreenState();
}

class _BecomeGuardianScreenState extends ConsumerState<BecomeGuardianScreen> {
  final _code = TextEditingController();
  String? _token;
  String? _inviterName;
  String? _accepted;
  bool _busy = false;
  bool _scanning = false;
  AppFailure? _error;

  @override
  void initState() {
    super.initState();
    _token = widget.token;
    if (_token != null) unawaited(_preview());
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  ({String? token, String? code}) _ref() => _token != null ? (token: _token, code: null) : (token: null, code: _code.text.trim());

  Future<void> _preview() async {
    final raw = _code.text.trim();
    if (_token == null && hasNonAsciiDigits(raw)) {
      setState(() => _error = AppFailure('CODE_NON_ASCII_DIGITS', extra: {'converted': toAsciiDigits(raw)}));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = _ref();
      final p = await ref.read(apiProvider).previewInvite(token: r.token, code: r.code);
      if (mounted) setState(() => _inviterName = p.name);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept() async {
    setState(() => _busy = true);
    try {
      final r = _ref();
      await ref.read(apiProvider).acceptInvite(token: r.token, code: r.code);
      if (mounted) setState(() => _accepted = _inviterName);
      ref.invalidate(peopleProvider);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _onScan(BarcodeCapture capture) {
    final raw = capture.barcodes.firstOrNull?.rawValue;
    final uri = raw == null ? null : Uri.tryParse(raw);
    final segments = uri?.pathSegments ?? const [];
    if (segments.length == 2 && segments.first == 'invite') {
      setState(() {
        _scanning = false;
        _token = segments.last;
      });
      unawaited(_preview());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (_accepted != null) {
      return AppPage(title: l.beGuardian, bottom: PrimaryButton(label: l.done, onPressed: () => context.go('/home')), children: [BodyText(l.acceptedBody(_accepted!), emphasis: true)]);
    }
    if (_inviterName != null) {
      return AppPage(
        title: l.beGuardian,
        bottom: Column(mainAxisSize: MainAxisSize.min, children: [
          PrimaryButton(label: l.accept, busy: _busy, onPressed: _accept),
          const Gap(10),
          SecondaryButton(label: l.cancel, onPressed: () => context.pop()),
        ]),
        children: [
          Semantics(header: true, child: Text(l.acceptTitle(_inviterName!), style: Theme.of(context).textTheme.headlineSmall)),
          const Gap(),
          BodyText(l.acceptBody),
          if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
        ],
      );
    }
    return AppPage(
      title: l.beGuardian,
      bottom: _scanning ? null : PrimaryButton(label: l.continueLabel, busy: _busy, onPressed: _preview),
      children: [
        if (_scanning) ...[
          BodyText(l.scanHint),
          const Gap(),
          SizedBox(height: 320, child: MobileScanner(onDetect: _onScan)),
          const Gap(),
          SecondaryButton(label: l.cancel, onPressed: () => setState(() => _scanning = false)),
        ] else ...[
          SecondaryButton(label: l.scanQr, icon: Icons.qr_code_scanner, onPressed: () => setState(() => _scanning = true)),
          const Gap(20),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: l.enterInviteCode),
            style: const TextStyle(fontSize: 26, letterSpacing: 4),
            inputFormatters: [PasteDetectingFormatter(ref.read(pasteTrackerProvider)), LengthLimitingTextInputFormatter(12)],
          ),
        ],
        if (_error != null) ...[
          const Gap(),
          FailureCard(
            failure: _error!,
            onConvertDigits: (c) => setState(() {
              _code.text = c;
              _error = null;
            }),
          ),
        ],
      ],
    );
  }
}

final inboxProvider = FutureProvider.autoDispose<GuardianInbox>((ref) => ref.watch(apiProvider).inbox());

/// A guardian deciding on a step-up. The decision is a passkey signature over a challenge bound
/// to this exact request; the guardian sees what is being changed and why it looked risky.
///
/// From a notification's Approve or Deny button ([act]), the passkey prompt opens as soon as the
/// request loads: one tap and a fingerprint, with the same signed challenge as from this screen.
class GuardianRequestScreen extends ConsumerStatefulWidget {
  const GuardianRequestScreen({super.key, required this.requestId, this.act});
  final String requestId;

  /// "approve" or "deny".
  final String? act;
  @override
  ConsumerState<GuardianRequestScreen> createState() => _GuardianRequestScreenState();
}

class _GuardianRequestScreenState extends ConsumerState<GuardianRequestScreen> {
  GuardianRequest? _req;
  AppFailure? _error;
  bool _busy = false;
  String? _decided;
  bool _stillRisky = false;
  StreamSubscription<Object>? _events;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _events = ref.read(realtimeProvider).events.where((e) => e.data['requestId'] == widget.requestId).listen((e) {
      if (e.name == 'guardian.request.live') {
        setState(() => _stillRisky = ((e.data['liveRules'] as List<Object?>?) ?? const []).isNotEmpty);
      } else if (e.name == 'guardian.request.closed') {
        unawaited(_load());
      }
    });
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    super.dispose();
  }

  bool _actedFromNotification = false;

  Future<void> _load() async {
    try {
      final r = await ref.read(apiProvider).guardianRequest(widget.requestId);
      if (mounted) setState(() => _req = r);
      final act = widget.act;
      if (mounted && !_actedFromNotification && (act == 'approve' || act == 'deny') && r.status == 'pending_guardians' && r.myDecision == null) {
        _actedFromNotification = true;
        unawaited(_decide(act!));
      }
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  Future<void> _decide(String decision) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final options = await api.decisionOptions(widget.requestId, decision);
      final response = await ref.read(passkeysProvider).authenticate(options);
      final result = await api.decide(widget.requestId, response);
      if (mounted) setState(() => _decided = result);
      ref.invalidate(inboxProvider);
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
    if (r == null) return AppPage(title: l.inboxTitle, children: [if (_error != null) FailureCard(failure: _error!, onRetry: _load) else const LoadingView()]);
    final open = r.status == 'pending_guardians' && _decided == null && r.myDecision == null;
    final callFirst = l.callFirst(r.requesterName);
    return AppPage(
      title: l.inboxTitle,
      bottom: open
          ? Column(mainAxisSize: MainAxisSize.min, children: [
              PrimaryButton(label: l.deny, icon: Icons.block, busy: _busy, onPressed: () => _decide('deny')),
              const Gap(10),
              SecondaryButton(label: l.approve, icon: Icons.check, onPressed: _busy ? null : () => _decide('approve')),
            ])
          : PrimaryButton(label: l.close, onPressed: () => context.pop()),
      children: [
        Semantics(header: true, child: Text(l.approveTitle(r.requesterName), style: Theme.of(context).textTheme.headlineSmall)),
        const Gap(8),
        BodyText(r.actionLabel, emphasis: true),
        if (r.summary != null) BodyText(r.summary!),
        BodyText(l.receivedAt(formatClock(r.createdAt, lang))),
        BodyText(l.requestExpiresAt(formatClock(r.expiresAt, lang))),
        if (_stillRisky) ...[const Gap(8), Semantics(liveRegion: true, child: BodyText(l.stillRisky, emphasis: true))],
        SectionTitle(l.whyPaused),
        ReasonList(reasons: r.reasons),
        const Gap(8),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(callFirst, emphasis: true))),
        SpeakButton(text: [l.approveTitle(r.requesterName), r.actionLabel, ...r.reasons.map((x) => x.text), callFirst].join('. '), autoSpeak: open),
        if (_decided == 'approve' || r.myDecision == 'approve') BodyText(l.youApproved, emphasis: true),
        if (_decided == 'deny' || r.myDecision == 'deny') BodyText(l.youDenied(r.requesterName), emphasis: true),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}

class GuardianRecoveryScreen extends ConsumerStatefulWidget {
  const GuardianRecoveryScreen({super.key, required this.recoveryId});
  final String recoveryId;
  @override
  ConsumerState<GuardianRecoveryScreen> createState() => _GuardianRecoveryScreenState();
}

class _GuardianRecoveryScreenState extends ConsumerState<GuardianRecoveryScreen> {
  GuardianRecovery? _rec;
  AppFailure? _error;
  bool _busy = false;
  String? _decided;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final r = await ref.read(apiProvider).guardianRecovery(widget.recoveryId);
      if (mounted) setState(() => _rec = r);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  Future<void> _decide(String decision) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final options = await api.recoveryDecisionOptions(widget.recoveryId);
      final response = await ref.read(passkeysProvider).authenticate(options);
      await api.recoveryDecide(widget.recoveryId, decision, response);
      if (mounted) setState(() => _decided = decision);
      ref.invalidate(inboxProvider);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final r = _rec;
    if (r == null) return AppPage(title: l.inboxTitle, children: [if (_error != null) FailureCard(failure: _error!, onRetry: _load) else const LoadingView()]);
    final open = r.status == 'pending_approvals' && _decided == null && r.myDecision == null;
    final callFirst = l.callFirst(r.requesterName);
    return AppPage(
      title: l.inboxTitle,
      bottom: open
          ? Column(mainAxisSize: MainAxisSize.min, children: [
              PrimaryButton(label: l.deny, icon: Icons.block, busy: _busy, onPressed: () => _decide('deny')),
              const Gap(10),
              SecondaryButton(label: l.approve, icon: Icons.check, onPressed: _busy ? null : () => _decide('approve')),
            ])
          : PrimaryButton(label: l.close, onPressed: () => context.pop()),
      children: [
        Semantics(header: true, child: Text(l.recoveryRequestTitle(r.requesterName), style: Theme.of(context).textTheme.headlineSmall)),
        const Gap(8),
        BodyText(l.newPhone(r.newDeviceName)),
        const Gap(),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyText(callFirst, emphasis: true))),
        SpeakButton(text: '${l.recoveryRequestTitle(r.requesterName)}. $callFirst', autoSpeak: open),
        if (_decided == 'approve' || r.myDecision == 'approve') BodyText(l.youApproved, emphasis: true),
        if (_decided == 'deny') BodyText(l.youDenied(r.requesterName), emphasis: true),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}
