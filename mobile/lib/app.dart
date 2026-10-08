import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'core/session/session_controller.dart';
import 'features/protection/protection_screens.dart';
import 'l10n/gen/app_localizations.dart';
import 'router.dart';
import 'ui/theme.dart';

class CoSignApp extends ConsumerStatefulWidget {
  const CoSignApp({super.key, this.enableDeepLinks = true});
  final bool enableDeepLinks;

  @override
  ConsumerState<CoSignApp> createState() => _CoSignAppState();
}

class _CoSignAppState extends ConsumerState<CoSignApp> with WidgetsBindingObserver {
  StreamSubscription<Uri>? _links;

  /// A message or link shared to Co-Sign opens "Check a link" (once signed in).
  Future<void> _checkShared() async {
    if (ref.read(sessionProvider).status != SessionStatus.signedIn) return;
    final text = await ref.read(signalsChannelProvider).takeSharedText();
    if (text != null && text.trim().isNotEmpty && mounted) unawaited(ref.read(routerProvider).push('/check-link', extra: text));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_checkShared());
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(ref.read(sessionProvider.notifier).restore());
    unawaited(
      ref.read(pushProvider).init(
            onOpen: (route) => ref.read(routerProvider).go(route),
            onForeground: (_) {},
          ),
    );
    if (widget.enableDeepLinks) {
      final links = AppLinks();
      _links = links.uriLinkStream.listen(_openLink);
    }
  }

  void _openLink(Uri uri) {
    if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'invite') {
      ref.read(routerProvider).go('/invite/${uri.pathSegments.last}');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_links?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Keep the background monitor's token and language in step with the app.
    ref
      ..listen(sessionProvider, (prev, next) {
        if (next.status == SessionStatus.signedIn && prev?.status != SessionStatus.signedIn) {
          unawaited(ref.read(protectionControllerProvider).sync());
          unawaited(_checkShared());
        }
      })
      ..listen(settingsProvider.select((s) => s.language), (_, _) {
        if (ref.read(sessionProvider).status == SessionStatus.signedIn) unawaited(ref.read(protectionControllerProvider).sync());
      });
    final settings = ref.watch(settingsProvider);
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      onGenerateTitle: (c) => AppLocalizations.of(c).appName,
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      locale: Locale(settings.language),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      highContrastTheme: buildTheme(Brightness.light),
      highContrastDarkTheme: buildTheme(Brightness.dark),
      builder: (context, child) {
        // Respect the system font size and multiply it by the in-app text size setting.
        final mq = MediaQuery.of(context);
        final scaler = TextScaler.linear((mq.textScaler.scale(1) * settings.textScale).clamp(1.0, 3.0));
        return MediaQuery(data: mq.copyWith(textScaler: scaler), child: child!);
      },
    );
  }
}
