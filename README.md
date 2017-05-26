[![Build Status](https://travis-ci.org/appium/appium-docker-android.svg?branch=master)](https://travis-ci.org/appium/appium-docker-android)
[![Docker Pulls](https://img.shields.io/docker/pulls/appium/appium.svg?style=flat-square)](https://hub.docker.com/r/appium/appium/)
[![](https://images.microbadger.com/badges/image/appium/appium.svg)](https://microbadger.com/images/appium/appium)
[![star this repo](http://githubbadges.com/star.svg?user=appium&repo=appium-docker-android&style=default)](https://github.com/appium/appium-docker-android)
[![fork this repo](http://githubbadges.com/fork.svg?user=appium&repo=appium-docker-android&style=default)](https://github.com/appium/appium-docker-android/fork)

# Appium Docker for Android

### Images Included:

- appium/appium - Docker Image to run appium tests on real android devices. See doc [here](https://github.com/appium/appium-docker-android/blob/master/Appium/README.md)
- To execute in android emulator's please visit [docker-android](https://github.com/butomo1989/docker-appium.git)

## Setting up Android real device test on Docker macOSX

1. Make sure you have latest docker installed on mac.

	```
	$ docker-machine --version
	$ docker-machine version 0.10.0, build 76ed2a6
	```

2. Create a docker-machine as follows

	```
	$ docker-machine create --driver virtualbox appium-test-machine
	```

3. Enable USB in created docker-machine

	```
	$ docker-machine stop appium-test-machine
	$ vboxmanage modifyvm appium-test-machine --usb on --usbehci on
	$ docker-machine start appium-test-machine
	```
	***Note:***
	You need to install [Extension Pack](https://www.virtualbox.org/wiki/Download_Old_Builds_5_1) depends on your virtualbox version, in case you get an Error "Implementation of the USB 2.0 controller not found"

4. Open Virtual box, move to appium-test-machine created, select USB and add Android device and Host Controller.

	![alt tag](Appium/virtualbox.png)

5. SSH into the docker machine created

	```
	$ docker-machine ssh appium-test-machine
	```

6. Run the docker image

	```
	$ docker run --name container-appium -d -P --privileged -v /dev/bus/usb:/dev/bus/usb appium/appium
	```

7. Plug in devices after container is running; otherwise it will shows nothing.

8. Run following command to verify adb devices can detect the connected android device.

	```
	$ docker exec -it container-appium bash "adb devices"
	```

9. Run UI Test with following test configuration

	```
	Push the apk file into the container
	$ docker cp /Users/loacl-macosx-path-to-apk/app-debug.apk container-appium:/opt

	Desired Capabilities:

	private void androidSetup() throws MalformedURLException {
	        caps.setCapability("deviceName", "Android");
	        caps.setCapability("app", "/opt/app-debug.apk");
	        //Get the IP Address of boot2docker
	        //docker inspect $(docker ps -q) | grep IPA
	        driver = new AndroidDriver<MobileElement>(new URL("http://192.168.99.100:32769/wd/hub"), caps);
	}
	```
