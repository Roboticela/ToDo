plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

// Bundle Mixkit library MP3s from the web public/ folder so ReminderSound can
// play the user's selected catalog tone without a JS→native base64 round-trip.
// android/ → plugin/ → src-tauri/ → repo root → public/sounds
val webSoundsDir = projectDir.resolve("../../../public/sounds")
val bundledSoundsDir = layout.projectDirectory.dir("src/main/assets/sounds")

tasks.register<Copy>("syncLibrarySounds") {
  from(webSoundsDir) {
    include("*.mp3")
  }
  into(bundledSoundsDir)
  onlyIf { webSoundsDir.isDirectory }
}

tasks.named("preBuild").configure { dependsOn("syncLibrarySounds") }

android {
  namespace = "app.tauri.reminderservice"
  compileSdk = 36

  defaultConfig {
    minSdk = 24
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    consumerProguardFiles("consumer-rules.pro")
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro",
      )
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
  }
  kotlinOptions {
    jvmTarget = "1.8"
  }
}

dependencies {
  // 1.12+ required for ServiceCompat.startForeground(..., foregroundServiceType)
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.6.0")
  implementation("com.google.android.material:material:1.7.0")
  testImplementation("junit:junit:4.13.2")
  androidTestImplementation("androidx.test.ext:junit:1.1.5")
  androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
  implementation(project(":tauri-android"))
}
