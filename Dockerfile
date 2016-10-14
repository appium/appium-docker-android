FROM beevelop/android-nodejs:latest

MAINTAINER Srinivasan Sekar <srinivasan.sekar1990@gmail.com>

#Setting JAVA_HOME in PATH
ENV PATH $PATH:$JAVA_HOME/bin

ENV DEBIAN_FRONTEND=noninteractive

#Display Java version
RUN java -version

#Display Gradle version
RUN gradle -v

#Display node version
RUN node -v

RUN apt-get update

#Install wget through apt-get
RUN apt-get install -y wget

#Install Maven
RUN apt-get install -y gdebi && \
  wget http://ppa.launchpad.net/natecarlson/maven3/ubuntu/pool/main/m/maven3/maven3_3.2.1-0~ppa1_all.deb && \
  gdebi --non-interactive maven3_3.2.1-0~ppa1_all.deb && \
  ln -s /usr/share/maven3/bin/mvn /usr/bin/mvn && \
  rm -rf maven3_3.2.1-0~ppa1_all.deb

#Displays Maven version
RUN mvn -v

#Install appium globally
RUN npm install -g appium

#Expose default port of appium
EXPOSE 4723

#Install appium doctor globally
RUN npm install appium-doctor -g

#Check health of appium android
RUN appium-doctor --android
