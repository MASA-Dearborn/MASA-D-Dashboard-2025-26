#include <WiFi.h>
#include <WebServer.h>

// 🔧 Change these to match your iPhone hotspot
const char* ssid = "";     
const char* password = "$";  

WebServer server(80);

const int ledPin = 2;  // On-board LED for most ESP32 boards

// HTML page
String htmlPage() {
  String html = "<!DOCTYPE html><html><head><title>ESP32 LED</title></head><body>";
  html += "<h1>ESP32 LED Control</h1>";
  html += "<p><a href=\"/on\"><button>LED ON</button></a></p>";
  html += "<p><a href=\"/off\"><button>LED OFF</button></a></p>";
  html += "</body></html>";
  return html;
}

void handleRoot() {
  server.send(200, "text/html", htmlPage());
}

void handleOn() {
  digitalWrite(ledPin, HIGH);
  server.send(200, "text/html", "<p>LED is ON</p>" + htmlPage());
}

void handleOff() {
  digitalWrite(ledPin, LOW);
  server.send(200, "text/html", "<p>LED is OFF</p>" + htmlPage());
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);

  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFailed to connect. Please check hotspot.");
  }

  // Web routes
  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);

  server.begin();
  Serial.println("Web server started.");
}

void loop() {
  server.handleClient();
}
