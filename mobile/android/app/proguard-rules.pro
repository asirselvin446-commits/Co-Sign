# Keep the platform-channel plugin and Play Integrity classes.
-keep class app.cosign.mobile.** { *; }
-keep class com.google.android.play.core.integrity.** { *; }
-dontwarn com.google.android.play.core.**
