#!/usr/bin/env bats

@test '[Docker] Verify Java is installed' {
    [ ${JAVA_HOME} == "/usr/lib/jvm/java-11-openjdk-amd64" ]
    java_ver=$(java -version 2>&1)
    [[ ${java_ver} == *"openjdk"* ]]
    [[ ${java_ver} == *"11"* ]]
}

@test '[Docker] Verify Android SDK is installed' {
    [ ${ANDROID_HOME} == "/opt/android" ]

    android_list_sdk=$(sdkmanager --list)
    [[ ${android_list_sdk} == *"Installed packages:"* ]]
    [[ ${android_list_sdk} == *"Available Packages:"* ]]

    adb_output=$(adb --version)
    [[ ${adb_output} == *"Installed as"* ]]
}

@test '[Docker] Verify node and npm is installed' {
    node_ver=$(node --version)
    [[ ${node_ver} == *"${NODE_VERSION}"* ]]
    npm_ver=$(node --version)
    [[ ${node_ver} == *"."* ]]
}

@test '[Docker] Verify Appium server is installed' {
    appium_ver=$(appium --version)
    [ ${appium_ver} == ${APPIUM_VERSION} ]
}

@test '[Docker] Verify Timezone' {
    timezone=$(cat /etc/timezone)
    [ ${timezone} == "Etc/${TZ}" ]
}

@test '[Docker] Verify used user' {
    used_user=$(whoami)
    [ ${used_user} == "androidusr" ]
}

@test '[Docker] Verify Workdir is /home/androidusr' {
    [ ${PWD} == "/home/androidusr" ]
}
