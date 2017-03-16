## Setting up Android real device test on Docker macOSX

1. Make sure you have latest docker installed on mac.
```aidl
docker-machine --version
docker-machine version 0.10.0, build 76ed2a6
```
2. Create a docker-machine as follows 

```aidl
 docker-machine create --driver virtualbox appium-test-machine
```
3. Open Virtual box, move to appium-test-machine created,select USB and add Android device and Host Controller.

![alt tag](https://raw.githubusercontent.com/saikrishna321/appium-docker-android/master/Appium/Screen_Shot_2017_03_14_at_8_27_33_PM.png)

4. SSH into the docker machine created and build/download the appium docker image

```
docker-machine ssh appium-test-machine

docker build -t appium/appium-docker-android github.com/appium/appium-docker-android

```
5. Run the docker image

```
docker run --name container-appium -d -P --privileged -v /dev/bus/usb:/dev/bus/usb appium/appium-docker-android

```

6. bash into the container to verify adb devices can detect the android device connected.
 
```aidl
docker exec -it container-appium bash "adb devices"
```

7. Test Configuration

```aidl
Push the apk file into the container 
docker cp /Users/loacl-macosx-path-to-apk/app-debug.apk container-appium:/opt

Desired Capabilities

 private void androidSetup() throws MalformedURLException {
        caps.setCapability("deviceName", "Android");
        caps.setCapability("app", "/opt/app-debug.apk");
        //Get the IP Address of boot2docker 
        //docker inspect $(docker ps -q) | grep IPA
        driver = new AndroidDriver<MobileElement>(new URL("http://192.168.99.100:32769/wd/hub"), caps);
       }
```
