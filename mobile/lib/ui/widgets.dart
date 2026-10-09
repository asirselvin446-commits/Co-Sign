import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/models.dart';
import '../core/errors/failure.dart';
import '../core/providers.dart';
import '../generated/catalog.g.dart';
import '../l10n/gen/app_localizations.dart';

extension L10nX on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// Standard page: title, scrollable padded body, readable width on tablets.
class AppPage extends StatelessWidget {
  const AppPage({super.key, required this.title, required this.children, this.actions, this.bottom, this.showBack = true});
  final String title;
  final List<Widget> children;
  final List<Widget>? actions;
  final Widget? bottom;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: actions, automaticallyImplyLeading: showBack),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: children,
            ),
          ),
        ),
      ),
      bottomNavigationBar: bottom == null ? null : SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 16), child: bottom)),
    );
  }
}

class Gap extends StatelessWidget {
  const Gap([this.size = 16, Key? key]) : super(key: key);
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(height: size, width: size);
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.busy = false, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final child = busy
        ? Row(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 3)),
            const SizedBox(width: 12),
            Flexible(child: Text(label)),
          ])
        : Text(label, textAlign: TextAlign.center);
    return SizedBox(
      width: double.infinity,
      child: icon != null && !busy
          ? FilledButton.icon(onPressed: onPressed, icon: Icon(icon), label: child)
          : FilledButton(onPressed: busy ? null : onPressed, child: child),
    );
  }
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({super.key, required this.label, required this.onPressed, this.icon, this.danger = false});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? Theme.of(context).colorScheme.error : null;
    final style = danger ? OutlinedButton.styleFrom(foregroundColor: color, side: BorderSide(color: color!, width: 1.5)) : null;
    return SizedBox(
      width: double.infinity,
      child: icon == null
          ? OutlinedButton(onPressed: onPressed, style: style, child: Text(label, textAlign: TextAlign.center))
          : OutlinedButton.icon(onPressed: onPressed, style: style, icon: Icon(icon), label: Text(label, textAlign: TextAlign.center)),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.titleLarge)),
      );
}

class BodyText extends StatelessWidget {
  const BodyText(this.text, {super.key, this.emphasis = false});
  final String text;
  final bool emphasis;
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: (emphasis ? Theme.of(context).textTheme.titleMedium : Theme.of(context).textTheme.bodyLarge)?.copyWith(height: 1.45),
      );
}

/// Speaks [text] once when shown (if voice is on) and offers a "Read aloud" button. If the phone
/// has no voice for the language, says so and stays text-only.
class SpeakButton extends ConsumerStatefulWidget {
  const SpeakButton({super.key, required this.text, this.autoSpeak = false});
  final String text;
  final bool autoSpeak;
  @override
  ConsumerState<SpeakButton> createState() => _SpeakButtonState();
}

class _SpeakButtonState extends ConsumerState<SpeakButton> {
  bool? _available;

  @override
  void initState() {
    super.initState();
    unawaited(_check());
  }

  Future<void> _check() async {
    final settings = ref.read(settingsProvider);
    final ok = await ref.read(voiceProvider).canSpeak(settings.language);
    if (!mounted) return;
    setState(() => _available = ok);
    if (ok && widget.autoSpeak && settings.voiceOn) unawaited(ref.read(voiceProvider).speak(widget.text, settings.language));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (_available == false) {
      return Padding(padding: const EdgeInsets.only(top: 8), child: Text(l.voiceUnavailable, style: Theme.of(context).textTheme.bodySmall));
    }
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: TextButton.icon(
        onPressed: _available == true ? () => ref.read(voiceProvider).speak(widget.text, ref.read(settingsProvider).language) : null,
        icon: const Icon(Icons.volume_up),
        label: Text(l.readAloud),
      ),
    );
  }
}

/// One cause, one next step: shown, announced to screen readers and (optionally) spoken.
class FailureCard extends ConsumerWidget {
  const FailureCard({super.key, required this.failure, this.onRetry, this.onConvertDigits});
  final AppFailure failure;
  final VoidCallback? onRetry;

  /// Offered for codes typed in Tamil or Devanagari digits.
  final void Function(String converted)? onConvertDigits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(settingsProvider).language;
    final e = explain(failure, lang);
    final scheme = Theme.of(context).colorScheme;
    final converted = failure.convertedCode;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Card(
        color: scheme.errorContainer,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.info_outline, color: scheme.onErrorContainer, semanticLabel: ''),
                const SizedBox(width: 10),
                Expanded(child: Text(e.cause, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: scheme.onErrorContainer))),
              ]),
              const SizedBox(height: 8),
              Text(e.next, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: scheme.onErrorContainer)),
              SpeakButton(key: ValueKey(e.spoken), text: e.spoken, autoSpeak: true),
              if (failure.code == ErrorCodes.CODE_NON_ASCII_DIGITS && converted != null && onConvertDigits != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: FilledButton.tonal(onPressed: () => onConvertDigits!(converted), child: Text('${context.l10n.convertDigits}: $converted')),
                ),
              // Usually Google Password Manager was turned off (for example when another app became
              // the phone's autofill service), so Android cannot see the passkey.
              if (failure.code == ErrorCodes.PASSKEY_NOT_ON_DEVICE)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: SecondaryButton(label: context.l10n.openPasskeySettings, icon: Icons.settings, onPressed: () => ref.read(signalsChannelProvider).openPasskeySettings()),
                ),
              if (onRetry != null) Padding(padding: const EdgeInsets.only(top: 8), child: SecondaryButton(label: context.l10n.tryAgain, onPressed: onRetry)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Plain-language list of why something was paused, each with its points.
class ReasonList extends StatelessWidget {
  const ReasonList({super.key, required this.reasons});
  final List<Reason> reasons;
  @override
  Widget build(BuildContext context) {
    if (reasons.isEmpty) return BodyText(context.l10n.noWarnings);
    return Column(
      children: [
        for (final r in reasons)
          Semantics(
            container: true,
            label: r.text,
            excludeSemantics: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.warning_amber_rounded, color: Theme.of(context).colorScheme.error),
                const SizedBox(width: 10),
                Expanded(child: BodyText(r.text)),
              ]),
            ),
          ),
      ],
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(32),
        child: Center(child: Semantics(label: context.l10n.loading, child: const CircularProgressIndicator())),
      );
}

/// Renders an AsyncValue: spinner, explained failure with retry, or the data.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.builder, this.onRetry});
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => value.when(
        data: builder,
        loading: () => const LoadingView(),
        error: (e, _) => FailureCard(failure: e is AppFailure ? e : AppFailure(ErrorCodes.INTERNAL_ERROR), onRetry: onRetry),
      );
}

Future<bool> confirmDialog(BuildContext context, String message, {String? confirmLabel, bool danger = false}) async {
  final l = context.l10n;
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      content: Text(message, style: Theme.of(c).textTheme.bodyLarge),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.cancel)),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(confirmLabel ?? l.continueLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text, style: const TextStyle(fontSize: 16)), duration: const Duration(seconds: 6)));
}
