// Arduino Uno #1 — Driver/Input ECU. Requires MCP_CAN_lib by Cory J. Fowler.
// USB protocol: SET,speed,accelerator,brake,soc,temp\n
#include <SPI.h>
#include <mcp_can.h>

const byte CAN_CS = 10, CAN_INT = 2;
const unsigned long INPUT_ID = 0x100;
MCP_CAN CAN(CAN_CS);
char serialLine[48]; byte serialIndex = 0;

void setup() {
  Serial.begin(115200); pinMode(CAN_INT, INPUT);
  while (CAN.begin(MCP_ANY, CAN_250KBPS, MCP_8MHZ) != CAN_OK) { delay(300); }
  CAN.setMode(MCP_NORMAL); Serial.println("READY,DRIVER_ECU");
}
void transmitInput(byte speed, byte accelerator, byte brake, byte soc, byte temperature) {
  byte payload[8] = {speed, accelerator, brake, soc, temperature, 0, 0, 0};
  CAN.sendMsgBuf(INPUT_ID, 0, 8, payload);
}
void parseSet(char *line) {
  int speed, accelerator, brake, soc, temperature;
  if (sscanf(line, "SET,%d,%d,%d,%d,%d", &speed,&accelerator,&brake,&soc,&temperature) == 5) {
    transmitInput(constrain(speed,0,120), constrain(accelerator,0,100), constrain(brake,0,1), constrain(soc,0,100), constrain(temperature,20,120));
  }
}
void readSerial() {
  while (Serial.available()) { char c=Serial.read(); if(c=='\n'||c=='\r'){if(serialIndex){serialLine[serialIndex]=0;parseSet(serialLine);serialIndex=0;}} else if(serialIndex<sizeof(serialLine)-1)serialLine[serialIndex++]=c; }
}
void loop() { readSerial(); }
