import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/api/models.dart';
import 'core/providers.dart';
import 'core/session/session_controller.dart';
import 'features/devices/devices_screen.dart';
import 'features/guardians/guardians_screens.dart';
import 'features/home/home_screen.dart';
import 'features/onboarding/onboarding_screens.dart';
import 'features/protection/protection_screens.dart';
import 'features/recovery/recovery_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/signin/signin_screens.dart';
import 'features/stepup/stepup_screen.dart';
import 'ui/widgets.dart';

const _publicPaths = {'/welcome', '/register', '/recover', '/link-phone', '/language'};

/// Re-evaluates redirects whenever the session or settings change.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref
      ..listen(sessionProvider, (_, _) => notifyListeners())
      ..listen(settingsProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);
  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final config = ref.read(configProvider);
      final settings = ref.read(settingsProvider);
      final session = ref.read(sessionProvider);
      final path = state.uri.path;
      if (!config.isConfigured) return path == '/config-missing' ? null : '/config-missing';
      if (session.status == SessionStatus.loading) return path == '/splash' ? null : '/splash';
      if (!settings.languageChosen) return path == '/language' ? null : '/language';
      // Invite links (https://domain/invite/<token>) arrive as deep links.
      if (path.startsWith('/invite/')) {
        final token = state.uri.pathSegments.last;
        return session.status == SessionStatus.signedIn ? '/guardian/accept?token=$token' : '/welcome';
      }
      if (session.status == SessionStatus.signedOut) {
        return _publicPaths.contains(path) ? null : '/welcome';
      }
      // Signed in.
      if (_publicPaths.contains(path) || path == '/splash') {
        if (path == '/language') return null;
        return settings.consentAsked ? '/home' : '/consent';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const Scaffold(body: LoadingView())),
      GoRoute(path: '/config-missing', builder: (c, _) => AppPage(title: c.l10n.configMissingTitle, showBack: false, children: [BodyText(c.l10n.configMissingBody)])),
      GoRoute(path: '/language', builder: (_, _) => const LanguageScreen()),
      GoRoute(path: '/welcome', builder: (_, _) => const WelcomeScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(path: '/recover', builder: (_, _) => const RecoveryScreen()),
      GoRoute(path: '/link-phone', builder: (_, _) => const LinkPhoneScreen()),
      GoRoute(path: '/consent', builder: (_, _) => const ConsentScreen()),
      GoRoute(path: '/permissions', builder: (_, _) => const PermissionsScreen()),
      GoRoute(path: '/home', builder: (_, s) => HomeScreen(tab: s.uri.queryParameters['tab'])),
      GoRoute(path: '/devices', builder: (_, _) => const DevicesScreen()),
      GoRoute(path: '/guardians', builder: (_, _) => const GuardiansScreen()),
      GoRoute(path: '/guardians/invite', builder: (_, _) => const InviteGuardianScreen()),
      GoRoute(path: '/guardian/accept', builder: (_, s) => BecomeGuardianScreen(token: s.uri.queryParameters['token'])),
      // The Family tab is the guardian's inbox now.
      GoRoute(path: '/guardian/inbox', redirect: (_, _) => '/home?tab=family'),
      GoRoute(path: '/guardian/request/:id', builder: (_, s) => GuardianRequestScreen(requestId: s.pathParameters['id']!, act: s.uri.queryParameters['act'])),
      GoRoute(path: '/guardian/person/:linkId', builder: (_, s) => PersonScreen(linkId: s.pathParameters['linkId']!, act: s.uri.queryParameters['act'])),
      GoRoute(path: '/guardian/signin/:id', builder: (_, s) => GuardianSigninScreen(signinId: s.pathParameters['id']!, act: s.uri.queryParameters['act'])),
      GoRoute(
        path: '/guardian/person/:linkId/signins',
        builder: (_, s) => SavedSigninsScreen(linkId: s.pathParameters['linkId']!, personName: s.extra as String? ?? ''),
      ),
      GoRoute(path: '/check-link', builder: (_, s) => CheckLinkScreen(initialText: s.extra as String?)),
      GoRoute(path: '/guardian/pause/:id', builder: (_, s) => PauseRequestScreen(pauseId: s.pathParameters['id']!, act: s.uri.queryParameters['act'])),
      GoRoute(path: '/guardian/recovery/:id', builder: (_, s) => GuardianRecoveryScreen(recoveryId: s.pathParameters['id']!)),
      GoRoute(path: '/stepup/:id', builder: (_, s) => StepupScreen(requestId: s.pathParameters['id']!, start: s.extra as StepupStart?)),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      GoRoute(path: '/protection', builder: (_, _) => const FamilyProtectionScreen()),
      GoRoute(path: '/guardian/alerts/:id', builder: (_, s) => AlertDetailScreen(alertId: s.pathParameters['id']!)),
      GoRoute(path: '/settings/permissions', builder: (_, _) => const PermissionsScreen(fromSettings: true)),
      GoRoute(path: '/invite/:token', builder: (_, _) => const Scaffold(body: LoadingView())),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
