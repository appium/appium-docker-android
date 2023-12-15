[![Build and Push](https://github.com/appium/appium-docker-android/actions/workflows/release.yml/badge.svg)](https://github.com/appium/appium-docker-android/actions/workflows/release.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/appium/appium.svg?style=flat-square)](https://hub.docker.com/r/appium/appium/)
[![](https://images.microbadger.com/badges/image/appium/appium.svg)](https://microbadger.com/images/appium/appium)


# Appium Docker for Android

## Why is this approach needed at first place?

- Helps in quick & easier setup of automation environment for Appium + Android
- Without this approach, you'll need to do each of the automation setup steps manually; which can be slow and error prone

## Images Included:

- appium/appium - Docker Image to run appium tests on real Android devices.
- To execute in Android emulator's please visit [docker-android](https://github.com/budtmo/docker-android)

## How to Build:

	$ docker build -t "appium/appium:local" -f Appium/Dockerfile Appium


## Quick Start

1. Connect Android device to the machine via USB

2. Run Appium-Docker-Android

	```
	$ docker run --privileged -d -p 4723:4723  -v /dev/bus/usb:/dev/bus/usb --name appium-container appium/appium
	```

	OR you can get the id of the device via this command ```ls -l /dev/serial/by-id``` and pass the device-id to container to have more security

	```
	docker run --privileged -d -p 4723:4723 --device=/dev/<your-device-id> --name appium-container appium/appium
	```

3. Run following command to verify adb devices can detect the connected android device.

	```
	$ docker exec -it appium-container adb devices
	```

	On Windows OS, you need to specify the host to `host.docker.internal`

	```
	$ docker exec -it appium-container adb -H host.docker.internal devices
	```

4. Run UI Test with following test configuration

	```
	Push the apk file into the container
	$ docker cp /home/myuser/localfolder/app-debug.apk appium-container:/home/androidusr/sample.apk

	Desired Capabilities:

	private void androidSetup() throws MalformedURLException {
	        caps.setCapability("deviceName", "Android");
	        caps.setCapability("app", "/home/androidusr/sample.apk");
	        //Get the IP Address of boot2docker
	        //docker inspect $(docker ps -q) | grep IPA
	        driver = new AndroidDriver<MobileElement>(new URL("http://192.168.99.100:32769/wd/hub"), caps);
	}
	```

	On Windows OS, you need to set the capability `appium:remoteAdbHost` to `host.docker.internal`. This capability is supported by various drivers: UiAutomator2, Espresso, Flutter.

## Additional configuration

### Share Android identification key

Each time, you will (re)create container, connected to container devices will ask for authorization after first
 connection.  To prevent that, you can share one identity through all created containers. To do that, you should:

- Connect all devices to docker physical machine
- Run `adb devices`
- Authorize all devices (do not forget to check **Always allow this computer**)

![Always allow this computer screenshot](images/authorization.png)

- run your containers with parameter `-v ~/.android:/home/androidusr/.android`

For example:
```
$ docker run --privileged -d -p 4723:4723 -v ~/.android:/home/androidusr/.android -v /dev/bus/usb:/dev/bus/usb --name appium-container appium/appium
```

### Connect Each Device to a Separate Container

In certain use cases you may want to have a single Appium-Docker-Android container running for each device. To achieve this you must run `adb kill-server` and then provide the `--device` option to `docker run`:

```
$ docker run -d -p 4723:4723 --device /dev/bus/usb/XXX/YYY:/dev/bus/usb/XXX/YYY -v ~/.android:/root/.android --name device1 appium/appium
$ docker run -d -p 4724:4723 --device /dev/bus/usb/XXX/ZZZ:/dev/bus/usb/XXX/ZZZ -v ~/.android:/root/.android --name device2 appium/appium
```

### Connect to Android devices by Air

Appium-Docker-Android can be connected with Android devices by Air.

To do that you need to configure android device, according to [official manual](https://developer.android.com/studio/command-line/adb.html#wireless)

Then run docker container with following parameters:

- REMOTE\_ADB=true
- ANDROID\_DEVICES=\<android\_device\_host\>:\<android\_device\_port\> \[,\<android\_device\_host\>:\<android\_device\_port\>\]
- REMOTE_ADB_POLLING_SEC=60 (default: 5, interval between polling the list of connected devices in order to connect to lost remote devices)

```
$ docker run -d -p 4723:4723 -e REMOTE_ADB=true -e ANDROID_DEVICES=192.168.0.5:5555,192.168.0.6:5555 -e REMOTE_ADB_POLLING_SEC=60
```

### Additional Appium parameter

APPIUM_ADDITIONAL_PARAMS="<additional-appium-parameter-here>", e.g. ```--relaxed-security --allow-insecure chromedriver_autodownload --allow-insecure adb_shell```

### Connect to Selenium Grid

Appium-Docker-Android can be connected with selenium grid by passing following parameters:

- CONNECT\_TO\_GRID=true
- APPIUM\_HOST=\<ip\_address\_of\_appium\_server>
- APPIUM\_PORT=\<port\_of\_appium\_server>
- SELENIUM\_HOST=\<ip\_address\_of\_selenium\_hub>
- SELENIUM\_PORT=\<port\_of\_selenium\_hub>

```
$ docker run --privileged -d -p 4723:4723 -e CONNECT_TO_GRID=true -e APPIUM_HOST="127.0.0.1" -e APPIUM_PORT=4723 -e SELENIUM_HOST="172.17.0.1" -e SELENIUM_PORT=4444 -v /dev/bus/usb:/dev/bus/usb --name appium-container appium/appium
```

### Custom Node Config

The image generates the node config file, if you would like to provide your own config pass the following parameters:

- CONNECT\_TO\_GRID=true
- CUSTOM\_NODE\_CONFIG=true
- -v \<path\_to\_config>:/root/nodeconfig.json

### Docker compose

There is [an example of compose file](examples/docker-compose.yml) to simulate the connection between selenium hub and appium server with connected device(s) in docker solution.

```
$ docker-compose up -d
```
