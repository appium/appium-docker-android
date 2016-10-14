# Appium Server setup to automate android testing on real devices inside docker

- Ant 1.9.6
- Maven 3.2.1
- Gradle 2.5 (Groovy 2.4.3)
- Android 24.4.1
    + APIs: android-10,android-15,android-16,android-17,android-18,android-19,android-20,android-21,android-22,android-23
    + Build-Tools: 23.0.3

----
### Pull from Docker Hub
```
docker pull srinivasansekar/docker-appium:latest
```

### Build from GitHub
```
docker build -t srinivasansekar/docker-appium github.com/srinivasansekar/docker-appium
```

### Run image
```
docker run -it srinivasansekar/docker-appium bash
```

### Use as base image
```Dockerfile
FROM srinivasansekar/docker-appium:latest
```
### Thanks to [beevelop/android-nodejs](https://github.com/beevelop/docker-android-nodejs.git)
