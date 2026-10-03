// Arduino Uno #2 — Vehicle Control/Decision ECU. This is the sole decision maker.
#include <SPI.h>
#include <mcp_can.h>
const byte CAN_CS=10, CAN_INT=2; const unsigned long INPUT_ID=0x100; MCP_CAN CAN(CAN_CS);
enum Decision { IDLE, NORMAL_DRIVE, HIGH_POWER_DEMAND, REGENERATIVE_BRAKING, POWER_LIMIT, MOTOR_PROTECTION, SPEED_LIMITING };
byte decide(byte speed, byte accelerator, byte brake, byte soc, byte temperature) {
  if(temperature>=100) return MOTOR_PROTECTION;
  if(soc<=20 && accelerator>=70) return POWER_LIMIT;
  if(brake) return REGENERATIVE_BRAKING;
  if(speed>=100) return SPEED_LIMITING;
  if(accelerator>=80) return HIGH_POWER_DEMAND;
  if(accelerator>0) return NORMAL_DRIVE;
  return IDLE;
}
const char* decisionNames[] = {"IDLE","NORMAL_DRIVE","HIGH_POWER_DEMAND","REGENERATIVE_BRAKING","POWER_LIMIT","MOTOR_PROTECTION","SPEED_LIMITING"};
const char* decisionReasons[] = {"Vehicle_idle","Normal_operation","High_accelerator_demand","Brake_applied","Low_SOC_high_power_demand","Critical_motor_temperature","High_vehicle_speed"};
void sendDashboardUpdate(byte *data, byte decision) {
  Serial.print("EV,");
  for (byte i=0; i<5; i++) { Serial.print(data[i]); Serial.print(','); }
  Serial.print(decisionNames[decision]); Serial.print(','); Serial.println(decisionReasons[decision]);
}
void setup(){Serial.begin(115200);pinMode(CAN_INT,INPUT);while(CAN.begin(MCP_ANY,CAN_250KBPS,MCP_8MHZ)!=CAN_OK)delay(300);CAN.setMode(MCP_NORMAL);Serial.println("READY,CONTROL_ECU");}
void loop(){if(!digitalRead(CAN_INT)){unsigned long id;byte len,data[8];CAN.readMsgBuf(&id,&len,data);if(id==INPUT_ID&&len>=5){byte decision=decide(data[0],data[1],data[2],data[3],data[4]);sendDashboardUpdate(data,decision);}}}
