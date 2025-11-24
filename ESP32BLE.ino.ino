#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>


#define MPU_ADDR 0x68


int16_t AcX, AcY, AcZ, Tmp;


float refX, refY, refZ;
unsigned long stillStart = 0;
const long idleTime = 5000;
const float rangeThreshold = 0.1;


#define BUZZER_PIN 23


unsigned long beepLastChange = 0;
bool buzzerOn = false;


// BLE UUIDs
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "abcdefab-1234-1234-1234-abcdefabcdef"


BLEServer *pServer;
BLECharacteristic *pCharacteristic;


void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire.setClock(100000);


  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);


  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);


  readAccelData();
  refX = AcX / 16384.0;
  refY = AcY / 16384.0;
  refZ = AcZ / 16384.0;
  stillStart = millis();


  BLEDevice::init("ESP32_BLE_ALARM");
  pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                     CHARACTERISTIC_UUID,
                     BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
                   );
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setValue("Booted.");
  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("BLE Service Started, waiting for connection...");
}


void loop() {
  readAccelData();


  float ax = AcX / 16384.0;
  float ay = AcY / 16384.0;
  float az = AcZ / 16384.0;


  bool withinRange =
    (abs(ax - refX) < rangeThreshold) &&
    (abs(ay - refY) < rangeThreshold) &&
    (abs(az - refZ) < rangeThreshold);


  String bleMsg;


  // Status first
  if (stillStart != 0 && (millis() - stillStart) > idleTime) {
    if ((millis() - beepLastChange) >= 200) {
      buzzerOn = !buzzerOn;
      digitalWrite(BUZZER_PIN, buzzerOn ? HIGH : LOW);
      beepLastChange = millis();
    }
    bleMsg += "Patient not moving!\n";
  } else {
    buzzerOn = false;
    digitalWrite(BUZZER_PIN, LOW);
    bleMsg += "Patient Active\n";
  }


  // Data below status
  bleMsg += "Data:\n";
  bleMsg += "X: " + String(ax,2) + "\n";
  bleMsg += "Y: " + String(ay,2) + "\n";
  bleMsg += "Z: " + String(az,2) + "\n";


  // Send via BLE
  pCharacteristic->setValue(bleMsg.c_str());
  pCharacteristic->notify();


  Serial.println(bleMsg);
  delay(200);


  // Movement reference update
  if (!withinRange) {
    stillStart = 0;
    refX = ax;
    refY = ay;
    refZ = az;
  } else {
    if (stillStart == 0) stillStart = millis();
  }
}


void readAccelData() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);


  AcX = Wire.read() << 8 | Wire.read();
  AcY = Wire.read() << 8 | Wire.read();
  AcZ = Wire.read() << 8 | Wire.read();
  Tmp = Wire.read() << 8 | Wire.read();
}



