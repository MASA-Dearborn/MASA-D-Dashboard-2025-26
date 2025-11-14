float data[8];

void setup() {
  Serial.begin(9600);  // start serial communication
}

void loop() {
  // Generate 8 random float values (like sensor data)
  for (int i = 0; i < 8; i++) {
    data[i] = random(0, 1000) / 10.0; // random number between 0.0 and 99.9
  }

  // Send all values as a comma-separated line
  for (int i = 0; i < 8; i++) {
    Serial.print(data[i]);
    if (i < 7) Serial.print(",");  // commas between values
  }
  Serial.println();  // end of line

  delay(500); // wait half a second before sending next set
}
