import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/session/session_controller.dart';
import '../../core/signals/signal_collector.dart';
import '../../ui/widgets.dart';

const languages = [('en', 'English'), ('ta', 'தமிழ்'), ('hi', 'हिन्दी')];

class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final settings = ref.watch(settingsProvider);
    return AppPage(
      title: l.languageTitle,
      showBack: false,
      bottom: PrimaryButton(
        label: l.continueLabel,
        onPressed: () async {
          await ref.read(settingsProvider.notifier).update(settings.copyWith(languageChosen: true));
          if (context.mounted) context.go('/welcome');
        },
      ),
      children: [
        BodyText(l.languageSubtitle),
        const Gap(),
        RadioGroup<String>(
          groupValue: settings.language,
          onChanged: (v) => ref.read(settingsProvider.notifier).update(settings.copyWith(language: v)),
          child: Column(
            children: [
              for (final (code, name) in languages)
                Card(
                  child: RadioListTile<String>(
                    value: code,
                    title: Text(name, style: const TextStyle(fontSize: 22)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});
  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  bool _busy = false;
  AppFailure? _error;

  Future<void> _signIn() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final options = await api.loginOptions();
      final response = await ref.read(passkeysProvider).authenticate(options);
      final device = await ref.read(deviceInfoProvider)();
      final known = await ref.read(sessionStoreProvider).knownDeviceId();
      final result = await api.loginVerify(response, deviceId: known, device: device);
      await ref.read(sessionProvider.notifier).completeAuth(result);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lost = ref.watch(sessionProvider).lostReason;
    return AppPage(
      title: l.appName,
      showBack: false,
      actions: [
        IconButton(tooltip: l.language, icon: const Icon(Icons.translate), onPressed: () => context.go('/language')),
      ],
      children: [
        const Gap(8),
        Semantics(header: true, child: Text(l.welcomeTitle, style: Theme.of(context).textTheme.headlineMedium)),
        const Gap(12),
        BodyText(l.welcomeBody),
        const Gap(24),
        if (lost != null) ...[FailureCard(failure: lost), const Gap()],
        if (_error != null) ...[FailureCard(failure: _error!), const Gap()],
        PrimaryButton(label: l.signIn, icon: Icons.fingerprint, busy: _busy, onPressed: _signIn),
        const Gap(12),
        SecondaryButton(label: l.createAccount, onPressed: () => context.push('/register')),
        const Gap(28),
        SecondaryButton(label: l.lostPhone, icon: Icons.phonelink_erase, onPressed: () => context.push('/recover')),
        const Gap(12),
        SecondaryButton(label: l.linkPhone, icon: Icons.add_to_home_screen, onPressed: () => context.push('/link-phone')),
      ],
    );
  }
}

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});
  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _handle = TextEditingController();
  final _name = TextEditingController();
  bool _busy = false;
  AppFailure? _error;

  @override
  void dispose() {
    _handle.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final options = await api.registerOptions(
        handle: _handle.text.trim().toLowerCase(),
        displayName: _name.text.trim(),
        locale: ref.read(settingsProvider).language,
        device: await ref.read(deviceInfoProvider)(),
      );
      final response = await ref.read(passkeysProvider).register(options);
      final result = await api.registerVerify(response);
      await ref.read(sessionProvider.notifier).completeAuth(result);
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
      title: l.registerTitle,
      bottom: PrimaryButton(label: l.createPasskey, icon: Icons.fingerprint, busy: _busy, onPressed: _create),
      children: [
        TextField(
          controller: _handle,
          decoration: InputDecoration(labelText: l.handleLabel, helperText: l.handleHint, helperMaxLines: 2),
          autocorrect: false,
          enableSuggestions: false,
          textInputAction: TextInputAction.next,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[a-zA-Z0-9._]')), LengthLimitingTextInputFormatter(30)],
        ),
        const Gap(),
        TextField(
          controller: _name,
          decoration: InputDecoration(labelText: l.nameLabel),
          textCapitalization: TextCapitalization.words,
          inputFormatters: [LengthLimitingTextInputFormatter(60)],
        ),
        const Gap(),
        BodyText(l.passkeyExplain),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}

/// Purpose-limited consent for device signals (DPDP Act 2023). Shown once after sign-in, and
/// changeable at any time in Settings.
class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({super.key});
  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  bool _busy = false;
  AppFailure? _error;

  Future<void> _answer(bool granted) async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiProvider);
      final current = await api.consent();
      await api.setConsent(granted, current.currentVersion);
      final settings = ref.read(settingsProvider);
      await ref.read(settingsProvider.notifier).update(settings.copyWith(consentAsked: true));
      if (mounted) context.go(granted ? '/permissions' : '/home');
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final points = [l.consentCall, l.consentRemote, l.consentScreen, l.consentSim];
    return AppPage(
      title: l.consentTitle,
      showBack: false,
      bottom: Column(mainAxisSize: MainAxisSize.min, children: [
        PrimaryButton(label: l.consentAllow, busy: _busy, onPressed: () => _answer(true)),
        const Gap(10),
        SecondaryButton(label: l.consentDecline, onPressed: _busy ? null : () => _answer(false)),
      ]),
      children: [
        BodyText(l.consentBody),
        const Gap(8),
        for (final p in points)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.check_circle_outline),
              const SizedBox(width: 10),
              Expanded(child: BodyText(p)),
            ]),
          ),
        const Gap(),
        BodyText(l.consentPrivacy),
        SpeakButton(text: [l.consentBody, ...points, l.consentPrivacy].join(' ')),
        if (_error != null) FailureCard(failure: _error!),
      ],
    );
  }
}

class PermissionsScreen extends ConsumerStatefulWidget {
  const PermissionsScreen({super.key, this.fromSettings = false});
  final bool fromSettings;
  @override
  ConsumerState<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends ConsumerState<PermissionsScreen> with WidgetsBindingObserver {
  Map<String, bool> _status = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back from system settings (usage access): refresh.
    if (state == AppLifecycleState.resumed) unawaited(_load());
  }

  Future<void> _load() async {
    final s = await ref.read(signalsChannelProvider).permissionStatus();
    if (mounted) setState(() => _status = s);
  }

  Future<void> _request(String group) async {
    await ref.read(signalsChannelProvider).requestPermissions([group]);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    Widget row(String key, String text, VoidCallback onAllow, {String? action}) {
      final granted = _status[key] ?? false;
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            BodyText(text),
            const Gap(10),
            granted
                ? Row(children: [const Icon(Icons.check_circle), const SizedBox(width: 8), Text(l.granted)])
                : SecondaryButton(label: action ?? l.allow, onPressed: onAllow),
          ]),
        ),
      );
    }

    return AppPage(
      title: l.permissionsTitle,
      showBack: widget.fromSettings,
      bottom: widget.fromSettings ? null : PrimaryButton(label: l.continueLabel, onPressed: () => context.go('/home')),
      children: [
        BodyText(l.permissionsNote, emphasis: true),
        const Gap(),
        row('phoneState', l.permPhone, () => _request('phone')),
        const Gap(10),
        row('callLog', l.permCallLog, () => _request('callLog')),
        const Gap(10),
        row('contacts', l.permContacts, () => _request('contacts')),
        const Gap(10),
        row('usageStats', l.permUsage, () => ref.read(signalsChannelProvider).openUsageAccessSettings(), action: l.openSettings),
      ],
    );
  }
}

/// New phone joins an account using the 8-digit code shown on an existing phone.
class LinkPhoneScreen extends ConsumerStatefulWidget {
  const LinkPhoneScreen({super.key});
  @override
  ConsumerState<LinkPhoneScreen> createState() => _LinkPhoneScreenState();
}

class _LinkPhoneScreenState extends ConsumerState<LinkPhoneScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  AppFailure? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final raw = _code.text.trim();
    if (hasNonAsciiDigits(raw)) {
      setState(() => _error = AppFailure('CODE_NON_ASCII_DIGITS', extra: {'converted': toAsciiDigits(raw)}));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final options = await api.deviceLinkOptions(raw, await ref.read(deviceInfoProvider)());
      final response = await ref.read(passkeysProvider).register(options);
      await ref.read(sessionProvider.notifier).completeAuth(await api.deviceLinkVerify(response));
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
      title: l.linkPhoneTitle,
      bottom: PrimaryButton(label: l.continueLabel, busy: _busy, onPressed: _submit),
      children: [
        BodyText(l.linkPhoneBody),
        const Gap(),
        TextField(
          controller: _code,
          decoration: InputDecoration(labelText: l.codeLabel),
          keyboardType: TextInputType.number,
          style: const TextStyle(fontSize: 26, letterSpacing: 4),
          inputFormatters: [PasteDetectingFormatter(ref.read(pasteTrackerProvider)), LengthLimitingTextInputFormatter(12)],
        ),
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
