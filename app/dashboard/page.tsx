"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PencilIcon, PlusIcon } from "@heroicons/react/24/solid";
import { subscribeToTopic, publishMessage } from "../../lib/mqttClient";
import { Suspense } from "react";

type PhaseValues = { v: number; i: number; p: number; e: number };
type MotorState = { isOn: boolean; onTime: string; offTime: string };
type ValveState = { isOn: boolean };

const VALVE_STATUS_TOPIC = "anuja/esp32/valve/status";
const VALVE_CONTROL_TOPIC = "anuja/esp32/valve/control";

const MOTOR_TOPICS: Record<number, { control: string; status: string }> = {
  0: {
    control: "anuja/esp32/motor/control",
    status: "anuja/esp32/motor/status",
  },
  1: {
    control: "anuja/esp32/motor2/control",
    status: "anuja/esp32/motor2/status",
  },
};

// Motor icon - sample (replace src with your own icon later)
const MOTOR_ICON_SRC =
  "https://res.cloudinary.com/dbyxgnjkw/image/upload/v1767021968/icons8-motor-50_ooixaf.png";

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [voltage, setVoltage] = useState(100);
  const [current, setCurrent] = useState(11.0);
  const [isModeConnected, setIsModeConnected] = useState(false);
  const [phases, setPhases] = useState<{
    p1: PhaseValues;
    p2: PhaseValues;
    p3: PhaseValues;
  }>({
    p1: { v: 0, i: 0, p: 0, e: 0 },
    p2: { v: 0, i: 0, p: 0, e: 0 },
    p3: { v: 0, i: 0, p: 0, e: 0 },
  });

  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");

  // Motors list (Motor 1, Motor 2, ... can add more)
  // Motors list (Motor 1, Motor 2, ... can add more)
  const [motorList, setMotorList] = useState<{ id: string; name: string }[]>(
    () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("motorList");
        if (saved) {
          try {
            return JSON.parse(saved);
          } catch (e) {
            console.error("Error loading motor list:", e);
          }
        }
      }
      return [
        { id: "motor1", name: "Motor 1" },
        { id: "motor2", name: "Motor 2" },
      ];
    },
  );

  const [expandedMotor, setExpandedMotor] = useState<string | null>(null);
  const [motorModes, setMotorModes] = useState<
    Record<string, "manual" | "auto">
  >(() => {
    if (typeof window !== "undefined") {
      const savedList = localStorage.getItem("motorList");
      const savedModes = localStorage.getItem("motorModes");
      if (savedList && savedModes) {
        try {
          return JSON.parse(savedModes);
        } catch (e) {
          console.error("Error loading motor modes:", e);
        }
      }
    }
    return { motor1: "manual", motor2: "manual" };
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("motorModes", JSON.stringify(motorModes));
    }
  }, [motorModes]);
  const [motors, setMotors] = useState<Record<string, MotorState>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("motors");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error loading motors:", e);
        }
      }
    }
    return {
      "Motor 1": { isOn: false, onTime: "06:00", offTime: "18:00" },
      "Motor 2": { isOn: false, onTime: "06:00", offTime: "18:00" },
    };
  });
  const [valves, setValves] = useState<Record<string, ValveState>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("valves");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            "Valve 1": { isOn: !!parsed["Valve 1"]?.isOn },
            "Valve 2": { isOn: !!parsed["Valve 2"]?.isOn },
          };
        } catch (e) {
          console.error("Error parsing valves:", e);
        }
      }
    }
    return { "Valve 1": { isOn: true }, "Valve 2": { isOn: false } };
  });
  const lastOnValve = useRef<"V1" | "V2">("V1");
  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const modeRef = useRef<Record<string, "manual" | "auto">>(motorModes);

  const [weatherData, setWeatherData] = useState({
    temperature: 21,
    humidity: 47.0,
    rainfall: 0,
    windSpeed: 0,
  });

  // Fetch real-time weather data based on user location
  useEffect(() => {
    async function fetchWeatherData(latitude: number, longitude: number) {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&timezone=auto`,
        );
        const data = await res.json();
        setWeatherData({
          temperature: Math.round(data.current.temperature_2m),
          humidity: data.current.relative_humidity_2m,
          rainfall: data.current.precipitation || 0,
          windSpeed: data.current.wind_speed_10m || 0,
        });
      } catch (error) {
        console.error("Failed to fetch weather:", error);
      }
    }

    // Get user's real-time location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          fetchWeatherData(latitude, longitude);
        },
        (error) => {
          console.error("Geolocation error:", error);
          // Fallback to Erode coordinates
          fetchWeatherData(11.341, 77.7172);
        },
      );
    } else {
      // Geolocation not supported, use default Erode coordinates
      fetchWeatherData(11.341, 77.7172);
    }
  }, []);

  // Handle weather banner click

  useEffect(() => {
    modeRef.current = motorModes;
  }, [motorModes]);

  useEffect(() => {
    const handleStorageChange = () => {
      const savedVoltage = localStorage.getItem("voltageThreshold");
      const savedCurrent = localStorage.getItem("currentThreshold");
      if (savedVoltage) setVoltage(Number(savedVoltage));
      if (savedCurrent) setCurrent(Number(savedCurrent));
    };
    window.addEventListener("thresholdsUpdated", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);
    handleStorageChange();
    return () => {
      window.removeEventListener("thresholdsUpdated", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeToTopic("anuja/esp32/mode/status", (payload) => {
      const trimmed = payload.trim();
      setIsModeConnected(!!trimmed && trimmed !== "--");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isModeConnected) return;
    const unsub = subscribeToTopic("anuja/esp32/pzem/energy_001", (payload) => {
      try {
        const data = JSON.parse(payload) as {
          p1?: PhaseValues;
          p2?: PhaseValues;
          p3?: PhaseValues;
        };
        setPhases((prev) => ({
          p1: data.p1 ?? prev.p1,
          p2: data.p2 ?? prev.p2,
          p3: data.p3 ?? prev.p3,
        }));
      } catch (err) {
        console.error("Failed to parse energy payload:", err);
      }
    });
    return () => unsub();
  }, [isModeConnected]);

  // Motor status subscriptions (Motor 1, Motor 2)
  useEffect(() => {
    const unsub1 = subscribeToTopic(MOTOR_TOPICS[0].status, (payload) => {
      const isOn = /^(ON|1|true)$/i.test(payload.trim());
      setMotors((prev) => {
        const updated = { ...prev, "Motor 1": { ...prev["Motor 1"], isOn } };
        if (typeof window !== "undefined")
          localStorage.setItem("motors", JSON.stringify(updated));
        return updated;
      });
    });
    const unsub2 = subscribeToTopic(MOTOR_TOPICS[1].status, (payload) => {
      const isOn = /^(ON|1|true)$/i.test(payload.trim());
      setMotors((prev) => {
        const updated = { ...prev, "Motor 2": { ...prev["Motor 2"], isOn } };
        if (typeof window !== "undefined")
          localStorage.setItem("motors", JSON.stringify(updated));
        return updated;
      });
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Valve status subscription
  useEffect(() => {
    const unsub = subscribeToTopic(VALVE_STATUS_TOPIC, (payload) => {
      const msg = payload.trim();
      setValves((prev) => {
        const next = { ...prev };
        msg.split(",").forEach((p) => {
          const [k, v] = p.split("=");
          const on = v?.trim().toUpperCase() === "ON";
          if (k === "V1") next["Valve 1"] = { isOn: on };
          if (k === "V2") next["Valve 2"] = { isOn: on };
          if (on && (k === "V1" || k === "V2"))
            lastOnValve.current = k as "V1" | "V2";
        });
        const anyOn = Object.values(next).some((v) => v.isOn);
        if (!anyOn) {
          const restore = lastOnValve.current || "V1";
          publishMessage(VALVE_CONTROL_TOPIC, `${restore}=ON`);
          if (restore === "V1") next["Valve 1"] = { isOn: true };
          else next["Valve 2"] = { isOn: true };
        }
        if (typeof window !== "undefined")
          localStorage.setItem("valves", JSON.stringify(next));
        return next;
      });
    });
    return () => unsub();
  }, []);

  const toggleMotor = (name: string, index: number) => {
    setMotors((p) => {
      const currentMotor = p[name] || {
        isOn: false,
        onTime: "06:00",
        offTime: "18:00",
      };
      const updated = {
        ...p,
        [name]: { ...currentMotor, isOn: !currentMotor.isOn },
      };
      if (typeof window !== "undefined")
        localStorage.setItem("motors", JSON.stringify(updated));

      const topic = MOTOR_TOPICS[index]?.control;
      if (topic) {
        const isOn = updated[name].isOn;
        publishMessage(topic, isOn ? "ON" : "OFF");
      }
      return updated;
    });
  };

  const handleToggleValve = (name: string) => {
    const valveKey = name === "Valve 1" ? "V1" : "V2";
    setValves((prev) => {
      const current = prev[name] || { isOn: false };
      const newIsOn = !current.isOn;
      if (!newIsOn) {
        const onCount = Object.values(prev).filter((v) => v.isOn).length;
        if (onCount <= 1) {
          alert("At least one valve must remain ON");
          return prev;
        }
      }
      const next = { ...prev, [name]: { isOn: newIsOn } };
      if (typeof window !== "undefined")
        localStorage.setItem("valves", JSON.stringify(next));
      publishMessage(
        VALVE_CONTROL_TOPIC,
        `${valveKey}=${newIsOn ? "ON" : "OFF"}`,
      );
      if (newIsOn) lastOnValve.current = valveKey;
      return next;
    });
  };

  const updateMotorTime = (
    name: string,
    field: "onTime" | "offTime",
    v: string,
  ) => {
    setMotors((p) => {
      const currentMotor = p[name] || {
        isOn: false,
        onTime: "06:00",
        offTime: "18:00",
      };
      const updated = { ...p, [name]: { ...currentMotor, [field]: v } };
      if (typeof window !== "undefined")
        localStorage.setItem("motors", JSON.stringify(updated));
      return updated;
    });
  };

  const setMotorMode = (motorId: string, mode: "manual" | "auto") => {
    setMotorModes((prev) => ({ ...prev, [motorId]: mode }));
    if (mode === "manual") {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      publishMessage("anuja/esp32/motor/control", "MANUAL");
    }
  };

  const saveAuto = (motorName: string, motorIndex: number) => {
    const motor = motors[motorName];
    if (!motor || motor.onTime === motor.offTime) {
      alert("Start time and end time cannot be the same");
      return;
    }
    const topic = MOTOR_TOPICS[motorIndex]?.control;
    if (topic) {
      publishMessage(topic, `AUTO,${motor.onTime},${motor.offTime}`);
    }
    if (motorModes[motorList[motorIndex]?.id] === "auto") {
      alert("Auto mode activated for " + motorName);
    }
  };

  const addMotorBlock = () => {
    setMotorList((prev) => {
      const n1 = prev.length + 1;
      const n2 = prev.length + 2;
      const newName1 = `Motor ${n1}`;
      const newName2 = `Motor ${n2}`;
      const newId1 = `motor_custom_${Date.now()}_1`;
      const newId2 = `motor_custom_${Date.now()}_2`;

      const updated = [
        ...prev,
        { id: newId1, name: newName1 },
        { id: newId2, name: newName2 },
      ];
      if (typeof window !== "undefined")
        localStorage.setItem("motorList", JSON.stringify(updated));
      
      setMotors((prevMotors) => {
        const updatedMotors = {
          ...prevMotors,
          [newName1]: { isOn: false, onTime: "06:00", offTime: "18:00" },
          [newName2]: { isOn: false, onTime: "06:00", offTime: "18:00" },
        };
        if (typeof window !== "undefined")
          localStorage.setItem("motors", JSON.stringify(updatedMotors));
        return updatedMotors;
      });

      setMotorModes((prevModes) => {
        const updatedModes: Record<string, "manual" | "auto"> = {
          ...prevModes,
          [newId1]: "manual",
          [newId2]: "manual",
        };
        if (typeof window !== "undefined")
          localStorage.setItem("motorModes", JSON.stringify(updatedModes));
        return updatedModes;
      });

      return updated;
    });
  };

  const removeMotorBlock = () => {
    if (motorList.length <= 2) return; // Keep at least one block

    setMotorList((prev) => {
      const updated = prev.slice(0, -2);
      const removed = prev.slice(-2);
      
      if (typeof window !== "undefined")
        localStorage.setItem("motorList", JSON.stringify(updated));

      setMotors((prevMotors) => {
        const updatedMotors = { ...prevMotors };
        removed.forEach(m => delete updatedMotors[m.name]);
        if (typeof window !== "undefined")
          localStorage.setItem("motors", JSON.stringify(updatedMotors));
        return updatedMotors;
      });

      setMotorModes((prevModes) => {
        const updatedModes: Record<string, "manual" | "auto"> = { ...prevModes };
        removed.forEach(m => delete updatedModes[m.id]);
        if (typeof window !== "undefined")
          localStorage.setItem("motorModes", JSON.stringify(updatedModes));
        return updatedModes;
      });

      return updated;
    });
  };

  const deleteMotor = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      setMotorList((prev) => {
        const updated = prev.filter((m) => m.id !== id);
        if (typeof window !== "undefined")
          localStorage.setItem("motorList", JSON.stringify(updated));
        return updated;
      });
      setMotors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        if (typeof window !== "undefined")
          localStorage.setItem("motors", JSON.stringify(updated));
        return updated;
      });
    }
  };

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, []);

  const phaseCircles = [
    {
      id: "p1",
      v: phases.p1.v.toFixed(1),
      a: phases.p1.i.toFixed(1),
      borderClass: "border-red-500",
    },
    {
      id: "p2",
      v: phases.p2.v.toFixed(1),
      a: phases.p2.i.toFixed(1),
      borderClass: "border-yellow-500",
    },
    {
      id: "p3",
      v: phases.p3.v.toFixed(1),
      a: phases.p3.i.toFixed(1),
      borderClass: "border-[#5bc0eb]",
    },
  ];

  const otherDevices = [
    {
      label: "Weather Station",
      icon: "https://img.freepik.com/premium-photo/weather-station-cartoon-vector-icon-illustration_1022901-71469.jpg",
      href: "/dashboard/weather-station",
    },
    {
      label: "Fertigation Mode",
      icon: "https://static.vecteezy.com/system/resources/previews/049/768/605/original/cartoon-of-cute-fertilizer-illustration-with-simple-colors-and-concept-free-vector.jpg",
      href: "/dashboard/fertigation",
    },
    {
      label: "Drone Monitoring",
      icon: "https://img.freepik.com/premium-vector/vector-illustration-smart-farming-tech-with-irrigation-drone-automatic-sprinkler-copter_251917-122.jpg?w=1060",
      href: "/dashboard/drone-monitoring",
    },
  ];

  return (
    <div
      className="relative flex min-h-screen flex-col"
      style={{ backgroundColor: "#eefae6" }}
    >
      {/* Top weather banner - desktop: centered content */}
      <header className="w-full shadow-[0px_9px_3px_-4px_rgba(0,0,0,0.35)]">
        <Link
          href="/dashboard/weather-details"
          className="block relative h-40 sm:h-48 lg:h-52 w-full overflow-hidden rounded-none shadow-md mb-0 cursor-pointer hover:opacity-95 transition-opacity"
        >
          <div className="absolute inset-0 overflow-hidden">
            <img
              src="/images/main_page_top.png"
              alt="Farm Background"
              className="h-full w-full object-cover object-bottom origin-bottom scale-y-130 rounded-sm "
            />
          </div>
          {mode && (
            <div className="absolute top-2 right-3 z-20 flex items-center gap-1 text-black font-semibold text-xs">
              <img
                src={
                  mode === "wifi"
                    ? "/images/wifi_icon.png"
                    : "/images/gsm_icon.png"
                }
                alt="connection"
                className="w-4 h-4"
              />

              <span>{mode.toUpperCase()} Connected</span>
            </div>
          )}
          <div className="h-full flex items-center justify-center px-4 sm:px-6 lg:px-8 relative z-10 ">
            <div className="w-full max-w-5xl lg:max-w-6xl mx-auto grid grid-cols-2 gap-4 sm:gap-6 lg:gap-8 place-items-center">
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src="/images/summer.png"
                    alt="Temperature"
                    className="w-8 h-8 sm:w-10 sm:h-10 opacity-80"
                  />
                  <span className="text-sm sm:text-base lg:text-lg text-black/90 font-bold">
                    Temperature
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-black">
                  {weatherData.temperature}°C
                </p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src="/images/rain.png"
                    alt="Rainfall"
                    className="w-8 h-8 sm:w-10 sm:h-10 opacity-80"
                  />
                  <span className="text-sm sm:text-base lg:text-lg text-black/90 font-bold">
                    Rainfall
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-black">
                  {weatherData.rainfall} mm
                </p>
              </div>
            </div>
          </div>
        </Link>
      </header>

      <main className="flex-1 px-4 sm:px-6 lg:px-10 xl:px-12 pt-6 pb-8 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-16 ">
        <div className="max-w-5xl lg:max-w-6xl mx-auto ">
          <h2 className="text-l sm:text-3xl font-extrabold uppercase tracking-wider text-[#1a1d1e] mb-6 text-center sm:text-left drop-shadow-sm">
            MOTOR CONTROL & MANAGEMENT
          </h2>

          <div className="space-y-6 relative">
            {/* Motor Blocks - Each pair in its own card */}
            {Array.from({ length: Math.ceil(motorList.length / 2) }).map((_, blockIdx) => {
              const motorsInBlock = motorList.slice(blockIdx * 2, blockIdx * 2 + 2);
              const firstMotorId = motorsInBlock[0]?.id;
              const currentBlockMode = motorModes[firstMotorId] || "manual";

              const setBlockMode = (newMode: "manual" | "auto") => {
                setMotorModes((prev) => {
                  const next: Record<string, "manual" | "auto"> = { ...prev };
                  motorsInBlock.forEach((m, i) => {
                    next[m.id] = newMode;
                    if (newMode === "manual") {
                      const motorIdx = blockIdx * 2 + i;
                      const topic = MOTOR_TOPICS[motorIdx]?.control;
                      if (topic) publishMessage(topic, "MANUAL");
                    }
                  });
                  return next;
                });
                
                if (newMode === "manual" && autoTimerRef.current) {
                  clearInterval(autoTimerRef.current);
                  autoTimerRef.current = null;
                }
              };

              return (
                <div key={blockIdx} className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0px_4px_20px_rgba(0,0,0,0.08)] border border-gray-100 relative space-y-6">
                  {/* Local Manual / Auto Toggle */}
                  <div className="flex justify-center">
                    <div className="bg-[#f7fdf4] rounded-full flex w-full max-w-[280px] shadow-sm border-none">
                      <button
                        onClick={() => setBlockMode("manual")}
                        className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                          currentBlockMode === "manual" 
                          ? "bg-[#b6e496] text-black border-none shadow-[0px_5px_6px_-1px_rgba(0,_0,_0,_0.8)]" 
                          : "text-gray-400"
                        }`}
                      >
                        MANUAL
                      </button>
                      <button
                        onClick={() => setBlockMode("auto")}
                        className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                          currentBlockMode === "auto" 
                          ? "bg-[#b6e496] text-black border-none shadow-[0px_5px_6px_-1px_rgba(0,_0,_0,_0.8)]" 
                          : "text-gray-400"
                        }`}
                      >
                        AUTO
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:gap-6">
                    {motorsInBlock.map((motor, idxInBlock) => {
                      const idx = blockIdx * 2 + idxInBlock;
                      const motorState = motors[motor.name] ?? {
                        isOn: false,
                        onTime: "06:00",
                        offTime: "18:00",
                      };

                      return (
                        <div
                          key={motor.id}
                          className="bg-[#eaf8e1] rounded-2xl p-2 sm:p-3 flex flex-col items-center shadow-sm hover:shadow-md transition-shadow duration-300"
                        >
                          <div 
                            className="flex flex-col items-center cursor-pointer w-full"
                            onClick={() => router.push(`/dashboard/motor-details/${motor.id}?mode=${mode}`)}
                          >
                            <h3 className="text-lg sm:text-xl font-bold text-black mb-0">
                              {motor.name}
                            </h3>

                            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-0">
                              <img
                                src="/images/motor.png"
                                alt={motor.name}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </div>

                          {currentBlockMode === "manual" ? (
                            <button
                              onClick={() => {
                                toggleMotor(motor.name, idx);
                              }}
                              className={`w-15 py-1 rounded-full font-bold text-xs shadow-sm transition-all active:scale-95 ${
                                motorState.isOn 
                                ? "bg-[#b6e496] text-black" 
                                : "bg-[#bcbcbc] text-black"
                              }`}
                            >
                              {motorState.isOn ? "ON" : "OFF"}
                            </button>
                          ) : (
                            <div className="w-full flex flex-col items-center px-2">
                              <div className="w-full flex items-center justify-center gap-2 mb-0">
                                <div className="flex flex-col items-center gap-0 w-full">
                                  <label className="text-[9px] font-bold text-[#4f8820]">Start Time</label>
                                  <input
                                    type="time"
                                    value={motorState.onTime}
                                    onChange={(e) => updateMotorTime(motor.name, "onTime", e.target.value)}
                                    className="w-full rounded-md border border-gray-300 px-0.5 py-0.5 text-[9px] text-center bg-white shadow-sm outline-none"
                                  />
                                </div>
                                
                                {/* Vertical Divider */}
                                <div className="w-[1.5px] h-8 bg-black mt-3 shrink-0" />

                                <div className="flex flex-col items-center gap-0 w-full">
                                  <label className="text-[9px] font-bold text-[#4f8820]">End Time</label>
                                  <input
                                    type="time"
                                    value={motorState.offTime}
                                    onChange={(e) => updateMotorTime(motor.name, "offTime", e.target.value)}
                                    className="w-full rounded-md border border-gray-300 px-0.5 py-0.5 text-[9px] text-center bg-white shadow-sm outline-none"
                                  />
                                </div>
                              </div>
                              <button
                                onClick={() => saveAuto(motor.name, idx)}
                                className="w-[60px] mt-1 rounded-full py-1 bg-[#557b44] hover:bg-[#466638] text-white text-[9px] font-bold shadow-md transition-colors mx-auto"
                              >
                                SAVE
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                {/* Controls - Aligned Side-by-Side */}
                {blockIdx === Math.ceil(motorList.length / 2) - 1 && (
                  <div className="absolute bottom-0 right-4 flex items-center gap-3 z-20 mb-1">
                    <button
                      onClick={addMotorBlock}
                      className="bg-black text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
                      title="Add Motor Block"
                    >
                      <PlusIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={removeMotorBlock}
                      className="bg-white text-red-600 p-2 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center border border-red-100"
                      title="Remove last block"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </main>
      <div>
        <img
          src="/images/design_img.png"
          alt="Footer Image"
          className="w-25 h-23 object-cover object-top mt-auto"
        />
      </div>
    </div>
  );
}
