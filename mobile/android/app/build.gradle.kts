import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing: android/key.properties (never committed). See README "Building the release APK".
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Host for verified app links (guardian invites, new-phone links). Pass -PcosignAppLinkHost=your.domain
// or set COSIGN_APP_LINK_HOST. It must match RP_ID on the backend.
val appLinkHost: String = (project.findProperty("cosignAppLinkHost") as String?)
    ?: System.getenv("COSIGN_APP_LINK_HOST")
    ?: "localhost"

android {
    namespace = "app.cosign.mobile"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications (java.time on older Android versions).
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "app.cosign.mobile"
        // Android 10+: Credential Manager passkeys, TelephonyCallback fallbacks and executors.
        minSdk = 29
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["appLinkHost"] = appLinkHost
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (keystoreProperties.containsKey("storeFile")) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Debug builds may talk to a backend on the local network over plain HTTP.
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("com.google.android.play:integrity:1.4.0")
    implementation("androidx.core:core-ktx:1.16.0")
    testImplementation("junit:junit:4.13.2")
}

// Firebase push is enabled when android/app/google-services.json is present (from your Firebase project).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

flutter {
    source = "../.."
}
