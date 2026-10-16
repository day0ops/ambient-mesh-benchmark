# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY ledger-service/pom.xml ledger-service/pom.xml
COPY account-service/pom.xml account-service/pom.xml
RUN mvn -B -ntp -pl ledger-service -am dependency:go-offline
COPY ledger-service ledger-service
RUN mvn -B -ntp -pl ledger-service -am package -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre AS otel
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.9.0/opentelemetry-javaagent.jar /otel/opentelemetry-javaagent.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/ledger-service/target/ledger-service-exec.jar app.jar
COPY --from=otel /otel/opentelemetry-javaagent.jar otel-javaagent.jar
ENV JAVA_TOOL_OPTIONS="-javaagent:/app/otel-javaagent.jar" \
    OTEL_SERVICE_NAME="ledger-service" \
    OTEL_TRACES_EXPORTER="otlp" \
    OTEL_METRICS_EXPORTER="none" \
    OTEL_LOGS_EXPORTER="none"
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
