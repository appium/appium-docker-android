#!/usr/bin/env bats

@test 'Verify Workdir is /root' {
    [ $PWD == "/root" ]
}

@test 'Verify Java is installed' {
    [ $JAVA_HOME == "/usr/lib/jvm/java-8-openjdk-amd64/jre" ]
    java_ver=$(java -version 2>&1 | awk '/version/{print $NF}')
    [[ $java_ver == *"1.8"* ]]
}

@test 'Verify Android SDK is installed' {
    [ $ANDROID_HOME == "/root" ]

    android_list_sdk=$(sdkmanager --list)
    [[ $android_list_sdk == *"Installed packages:"* ]]
    [[ $android_list_sdk == *"Available Packages:"* ]]
}

@test 'Verify Appium server is installed' {
    appium_ver=$(appium --version)
    [ $appium_ver == $APPIUM_VERSION ]
}

@test 'Verify Timezone' {
    timezone=$(cat /etc/timezone)
    [ $timezone == $TZ ]
}
