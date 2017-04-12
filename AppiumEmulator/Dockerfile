FROM appium/appium

MAINTAINER Srinivasan Sekar <srinivasan.sekar1990@gmail.com>

ENV ANDROID_APIS="android-24"

#================================================================
# Includes Android SDK
#================================================================
RUN echo y | android update sdk -a -u -t ${ANDROID_APIS},sys-img-armeabi-v7a-$ANDROID_APIS

#================================================================
# Creates Nexus 5 Emulator by default
#================================================================
RUN echo "no" | android create avd \
                --force \
                --device "Nexus 5" \
                --name "Nexus" \
                --target ${ANDROID_APIS} \
                --abi armeabi-v7a \
                --skin WVGA800

CMD emulator64-arm -avd Nexus -no-boot-anim -no-window -noaudio -gpu off & adb wait-for-device & appium
