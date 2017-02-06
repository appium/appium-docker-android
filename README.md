[![Build Status](https://travis-ci.org/appium/appium-docker-android.svg?branch=master)](https://travis-ci.org/appium/appium-docker-android)
[![Docker Pulls](https://img.shields.io/docker/pulls/appium/appium-docker-android.svg?style=flat-square)](https://hub.docker.com/r/appium/appium-docker-android/)
[![](https://images.microbadger.com/badges/image/appium/appium-docker-android.svg)](https://microbadger.com/images/appium/appium-docker-android)
[![](https://images.microbadger.com/badges/version/appium/appium-docker-android.svg)](https://microbadger.com/images/appium/appium-docker-android)

# Appium setup to automate android testing on real devices

- JDK 8
- Node 6.9.0
- Maven 3.2.1
- Android 25.0.0
    + Avaliable Android Targets/Virtual Devices Details: https://github.com/appium/appium-docker-android/blob/master/AndroidDeviceDirectory.md
    + APIs: android-20,android-21,android-22,android-23,android-24
    + Build-Tools: 25.0.0
- Appium Latest
- Appium doctor

----
### Pull from Docker Hub
```
docker pull appium/appium-docker-android:latest
```

### Build from GitHub
```
docker build -t appium/appium-docker-android github.com/appium/appium-docker-android
```

### Run image
```
docker run -it appium/appium-docker-android bash
```

### Launch the Emulator Nexus
```
emulator64-arm -avd Nexus -no-boot-anim -noaudio -no-window -gpu off
```

### Use as base image
```Dockerfile
FROM appium/appium-docker-android:latest
```
