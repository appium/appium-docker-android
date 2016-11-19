FROM beevelop/android-nodejs:latest

MAINTAINER Srinivasan Sekar <srinivasan.sekar1990@gmail.com>

#=======================================================================
# Includes minimal runtime used for executing non GUI Java programs
#=======================================================================
RUN apt-get update -qqy \
  && apt-get -qqy --no-install-recommends install \
    bzip2 \
    ca-certificates \
    openjdk-8-jre-headless \
    sudo \
    unzip \
    wget \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
  && sed -i 's/securerandom\.source=file:\/dev\/random/securerandom\.source=file:\/dev\/urandom/' ./usr/lib/jvm/java-8-openjdk-amd64/jre/lib/security/java.security

#=======================================
# Setting JAVA_HOME in PATH
#=======================================
ENV PATH $PATH:$JAVA_HOME/bin

ENV DEBIAN_FRONTEND noninteractive

#=======================================
# Display JAVA version
#=======================================
RUN java -version

#=======================================
# Display Gradle version
#=======================================
RUN gradle -v

#=======================================
# Includes latest node LTS version
#=======================================
ENV NODEJS_VERSION=6.9.1 \
    PATH=$PATH:/opt/node/bin

WORKDIR "/opt/node"

RUN apt-get install -y curl ca-certificates --no-install-recommends && \
    curl -sL https://nodejs.org/dist/v${NODEJS_VERSION}/node-v${NODEJS_VERSION}-linux-x64.tar.gz | tar xz --strip-components=1 && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

#=======================================
# Display Gradle version
#=======================================
RUN node -v

#=======================================
# Includes Appium globally
#=======================================
RUN npm install -g appium

#Expose default port of appium
EXPOSE 4723

#=======================================
# Includes Appium docktor globally
#=======================================
RUN npm install appium-doctor -g

#Check health of appium android
RUN appium-doctor --android
