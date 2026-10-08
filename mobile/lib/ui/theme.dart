import 'package:flutter/material.dart';

/// Co-Sign's look: a calm night-indigo base, and one strong colour per safety state, used only
/// where state is shown (the status band, person cards, alert dots). Large type and large targets
/// throughout; every pairing meets WCAG AA contrast. System fonts only (Roboto / Noto cover
/// Tamil and Devanagari without downloads).
class Palette {
  static const indigo = Color(0xFF1B2559);
  static const indigoSoft = Color(0xFFE6E9F7);
  static const paper = Color(0xFFF5F6FA);
  static const ink = Color(0xFF151A2D);
  static const safe = Color(0xFF17714A);
  static const warn = Color(0xFF8A5300);
  static const danger = Color(0xFFB3261E);
  static const muted = Color(0xFF545B73);

  // Dark theme counterparts.
  static const nightBg = Color(0xFF0F1428);
  static const nightSurface = Color(0xFF182042);
  static const nightInk = Color(0xFFE8EAF4);
  static const safeDark = Color(0xFF7DD3A8);
  static const warnDark = Color(0xFFF5C46B);
  static const dangerDark = Color(0xFFFFB4AB);
}

/// Safety-state colours, so screens never hard-code them.
@immutable
class SafetyColors extends ThemeExtension<SafetyColors> {
  const SafetyColors({required this.safe, required this.warn, required this.danger, required this.off, required this.onBand, required this.muted});
  final Color safe;
  final Color warn;
  final Color danger;
  final Color off;

  /// Text on a filled status band.
  final Color onBand;
  final Color muted;

  @override
  SafetyColors copyWith({Color? safe, Color? warn, Color? danger, Color? off, Color? onBand, Color? muted}) =>
      SafetyColors(safe: safe ?? this.safe, warn: warn ?? this.warn, danger: danger ?? this.danger, off: off ?? this.off, onBand: onBand ?? this.onBand, muted: muted ?? this.muted);

  @override
  SafetyColors lerp(ThemeExtension<SafetyColors>? other, double t) => other is SafetyColors
      ? SafetyColors(
          safe: Color.lerp(safe, other.safe, t)!,
          warn: Color.lerp(warn, other.warn, t)!,
          danger: Color.lerp(danger, other.danger, t)!,
          off: Color.lerp(off, other.off, t)!,
          onBand: Color.lerp(onBand, other.onBand, t)!,
          muted: Color.lerp(muted, other.muted, t)!,
        )
      : this;
}

extension SafetyColorsX on BuildContext {
  SafetyColors get safety => Theme.of(this).extension<SafetyColors>()!;
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: Palette.indigo,
    brightness: brightness,
    primary: dark ? const Color(0xFFB9C3FF) : Palette.indigo,
    onPrimary: dark ? const Color(0xFF111A4A) : Colors.white,
    primaryContainer: dark ? const Color(0xFF2B3670) : Palette.indigoSoft,
    onPrimaryContainer: dark ? Palette.nightInk : Palette.indigo,
    error: dark ? Palette.dangerDark : Palette.danger,
    surface: dark ? Palette.nightSurface : Colors.white,
    onSurface: dark ? Palette.nightInk : Palette.ink,
    onSurfaceVariant: dark ? const Color(0xFFC3C7DA) : Palette.muted,
  );
  final base = Typography.material2021(platform: TargetPlatform.android);
  final text = (dark ? base.white : base.black).apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface).copyWith(
        headlineMedium: const TextStyle(fontSize: 30, height: 1.2, fontWeight: FontWeight.w700, letterSpacing: -0.2),
        headlineSmall: const TextStyle(fontSize: 24, height: 1.25, fontWeight: FontWeight.w700),
        titleLarge: const TextStyle(fontSize: 21, height: 1.3, fontWeight: FontWeight.w700),
        titleMedium: const TextStyle(fontSize: 18, height: 1.35, fontWeight: FontWeight.w600),
        bodyLarge: const TextStyle(fontSize: 18, height: 1.45),
        bodyMedium: const TextStyle(fontSize: 16, height: 1.45),
        labelLarge: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      );
  final textTheme = text.apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface);
  const minTarget = Size(64, 58);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark ? Palette.nightBg : Palette.paper,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    visualDensity: VisualDensity.standard,
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? Palette.nightBg : Palette.paper,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 1,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: minTarget, shape: shape, textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: minTarget, shape: shape, side: BorderSide(color: scheme.primary, width: 1.5), textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 48), textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? Palette.nightSurface : Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      labelStyle: const TextStyle(fontSize: 17),
    ),
    listTileTheme: ListTileThemeData(minVerticalPadding: 12, minTileHeight: 64, titleTextStyle: textTheme.bodyLarge, subtitleTextStyle: textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
    cardTheme: CardThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: dark ? const Color(0xFF2B3466) : const Color(0xFFDDE1EE))),
      margin: EdgeInsets.zero,
      elevation: 0,
      color: dark ? Palette.nightSurface : Colors.white,
    ),
    dividerTheme: DividerThemeData(color: dark ? const Color(0xFF2B3466) : const Color(0xFFDDE1EE), space: 1),
    navigationBarTheme: NavigationBarThemeData(
      height: 76,
      backgroundColor: dark ? Palette.nightSurface : Colors.white,
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: scheme.onSurface)),
      iconTheme: WidgetStatePropertyAll(IconThemeData(size: 28, color: scheme.onSurface)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    extensions: [
      SafetyColors(
        safe: dark ? Palette.safeDark : Palette.safe,
        warn: dark ? Palette.warnDark : Palette.warn,
        danger: dark ? Palette.dangerDark : Palette.danger,
        off: dark ? const Color(0xFF8E95B5) : Palette.muted,
        onBand: dark ? Palette.nightBg : Colors.white,
        muted: dark ? const Color(0xFFC3C7DA) : Palette.muted,
      ),
    ],
  );
}
