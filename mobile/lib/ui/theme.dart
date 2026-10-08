import 'package:flutter/material.dart';

/// High-contrast, large-target theme. Colours meet WCAG AA contrast on their backgrounds.
ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: const Color(0xFF0B5CAD),
    brightness: brightness,
    primary: dark ? const Color(0xFF9CC8FF) : const Color(0xFF0B4F94),
    onPrimary: dark ? const Color(0xFF00213F) : Colors.white,
    error: dark ? const Color(0xFFFFB4AB) : const Color(0xFFB3261E),
    surface: dark ? const Color(0xFF111418) : Colors.white,
    onSurface: dark ? const Color(0xFFE8EBF0) : const Color(0xFF111418),
  );
  const minTarget = Size(64, 56);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    visualDensity: VisualDensity.standard,
    textTheme: Typography.material2021(platform: TargetPlatform.android).black.apply(
          bodyColor: scheme.onSurface,
          displayColor: scheme.onSurface,
        ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: minTarget, shape: shape, textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: minTarget, shape: shape, side: BorderSide(color: scheme.primary, width: 1.5), textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 48), textStyle: const TextStyle(fontSize: 17))),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      labelStyle: const TextStyle(fontSize: 17),
    ),
    listTileTheme: const ListTileThemeData(minVerticalPadding: 12, minTileHeight: 64),
    cardTheme: CardThemeData(shape: shape, margin: EdgeInsets.zero),
  );
}
