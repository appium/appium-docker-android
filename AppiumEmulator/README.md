# Appium docker for Android Emulator's

## Run Docker Image

```
$ docker run -d -P --name appium-emulator appium/appium-emulator
```

## To check android emulator status

```
$ docker exec -it appium-emulator /bin/sh "adb devices"
```

## Check Logs

```
$ docker logs --follow appium-emulator
```
