pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        // Orch8's public Maven repository: io.orch8:orch8-mobile (AAR + POM).
        maven("https://raw.githubusercontent.com/orch8-io/maven/main")
    }
}

rootProject.name = "Orch8Example"
include(":app")
