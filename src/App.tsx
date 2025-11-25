import React, { useMemo, useState } from "react";

// --- Mock types
/**
 * Window statuses: Planned → Frozen → Ready → Go → Executing → Completed / Moved / Cancelled
 * Checklist: OK | RISK | NOGO
 * Reserve slot: Free | Held | Used
 */

const HORIZONS = { YEAR: "year", MONTH: "month", OPER: "oper" } as const;

type ChecklistState = "OK" | "RISK" | "NOGO";

interface WindowPlan {
  id: string;
  section: string; // участок
  cluster: string; // куст
  startPlan: string; // ISO
  endPlan: string;
  durationMin: number;
  horizon: keyof typeof HORIZONS | "month" | "oper" | "year";
  workType: string;
  riskScore: number; // 0..1 (p_success)
  riskClass: "green" | "yellow" | "red";
  bufferMin?: number; // требуемый буфер
  status: "Planned" | "Frozen" | "Ready" | "Go" | "Executing" | "Completed" | "Moved" | "Cancelled";
  conflicts?: string[]; // описания конфликтов
  factors: { name: string; impact: "+" | "-"; note: string }[]; // объяснение риска
  checklists: {
    T72: Record<string, ChecklistState>;
    T24: Record<string, ChecklistState>;
    T6: Record<string, ChecklistState>;
  };
  history: { ts: string; actor: string; action: string; note?: string }[];
}

interface ReserveSlot {
  id: string;
  cluster: string;
  section: string;
  start: string; // ISO
  end: string;
  type: "hot" | "cold"; // 30–60m vs 2–4h
  status: "Free" | "Held" | "Used";
}

// --- Mock data (you can edit inline during the demo)
const MOCK_WINDOWS: WindowPlan[] = [
  {
    id: "A-173",
    section: "ПК 245–ПК 260",
    cluster: "Кластер Вост-12",
    startPlan: "2025-10-08T10:00:00",
    endPlan: "2025-10-08T14:00:00",
    durationMin: 240,
    horizon: "month",
    workType: "Сварка стыков",
    riskScore: 0.68,
    riskClass: "yellow",
    bufferMin: 30,
    status: "Frozen",
    conflicts: ["Совмещение с путевой машиной ПРК-2"],
    factors: [
      { name: "Сезон (пик работ)", impact: "-", note: "июнь–сентябрь" },
      { name: "История срывов на участке", impact: "-", note: "2 из 6 в 2024" },
      { name: "Тяга/бригады подтверждены", impact: "+", note: "T−72 ОК" },
      { name: "Погода", impact: "+", note: "штиль" },
    ],
    checklists: {
      T72: { ЦДИ: "OK", ЦДУД: "OK", ТЯГА: "RISK", ИСПОЛН: "OK" },
      T24: { ЦДИ: "OK", ЦДУД: "OK", ТЯГА: "NOGO", ИСПОЛН: "OK" },
      T6: { ЦДИ: "OK", ЦДУД: "OK", ТЯГА: "OK", ИСПОЛН: "OK" },
    },
    history: [
      { ts: "2025-09-30T09:00:00", actor: "Система", action: "Рассчитан риск = 0.68 (жёлтое)", note: "требуется буфер 30м" },
      { ts: "2025-10-06T10:00:00", actor: "Тяга", action: "T−72: RISK", note: "бригада занята на соседнем окне" },
      { ts: "2025-10-07T10:00:00", actor: "Тяга", action: "T−24: NOGO", note: "бригада не освобождена" },
    ],
  },
  {
    id: "B-021",
    section: "ПК 110–ПК 118",
    cluster: "Кластер Вост-12",
    startPlan: "2025-10-09T03:00:00",
    endPlan: "2025-10-09T04:00:00",
    durationMin: 60,
    horizon: "oper",
    workType: "Диагностика ДИСК",
    riskScore: 0.86,
    riskClass: "green",
    status: "Ready",
    conflicts: [],
    factors: [
      { name: "Низкая загрузка", impact: "+", note: "ночной интервал" },
      { name: "Ресурсы подтверждены", impact: "+", note: "T−24 ОК" },
    ],
    checklists: {
      T72: { ЦДИ: "OK", ЦДУД: "OK", ТЯГА: "OK", ИСПОЛН: "OK" },
      T24: { ЦДИ: "OK", ЦДУД: "OK", ТЯГА: "OK", ИСПОЛН: "OK" },
      T6: { ЦДИ: "OK", ЦДУД: "OK", ТЯГА: "OK", ИСПОЛН: "OK" },
    },
    history: [
      { ts: "2025-10-05T12:00:00", actor: "Система", action: "Рассчитан риск = 0.86 (зелёное)" },
    ],
  },
  {
    id: "C-309",
    section: "ПК 501–ПК 510",
    cluster: "Кластер Вост-21",
    startPlan: "2025-10-10T11:00:00",
    endPlan: "2025-10-10T15:00:00",
    durationMin: 240,
    horizon: "month",
    workType: "Шлифовка рельса",
    riskScore: 0.55,
    riskClass: "red",
    bufferMin: 60,
    status: "Planned",
    conflicts: ["Высокая загрузка участка", "Совмещённые работы (связь)"],
    factors: [
      { name: "Сезонный пик", impact: "-", note: "октябрь" },
      { name: "Совмещения", impact: "-", note: "связисты" },
      { name: "Погода", impact: "-", note: "дождь по прогнозу" },
    ],
    checklists: {
      T72: { ЦДИ: "RISK", ЦДУД: "RISK", ТЯГА: "RISK", ИСПОЛН: "RISK" },
      T24: { ЦДИ: "RISK", ЦДУД: "RISK", ТЯГА: "RISK", ИСПОЛН: "RISK" },
      T6: { ЦДИ: "RISK", ЦДУД: "RISK", ТЯГА: "RISK", ИСПОЛН: "RISK" },
    },
    history: [
      { ts: "2025-09-29T11:00:00", actor: "Система", action: "Рассчитан риск = 0.55 (красное)", note: "исключить из портфеля" },
    ],
  },
];

const MOCK_SLOTS: ReserveSlot[] = [
  { id: "R-101", cluster: "Кластер Вост-12", section: "ПК 240–ПК 262", start: "2025-10-09T12:00:00", end: "2025-10-09T14:00:00", type: "cold", status: "Free" },
  { id: "R-102", cluster: "Кластер Вост-12", section: "ПК 238–ПК 246", start: "2025-10-08T15:00:00", end: "2025-10-08T16:00:00", type: "hot", status: "Free" },
  { id: "R-103", cluster: "Кластер Вост-21", section: "ПК 499–ПК 512", start: "2025-10-11T08:00:00", end: "2025-10-11T10:00:00", type: "cold", status: "Free" },
];

// --- Utilities
function cls(...arr: Array<string | false | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function fmt(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString();
}

function durationMin(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

// --- Components
function RiskBadge({ riskClass, score }: { riskClass: WindowPlan["riskClass"]; score: number }) {
  const color = riskClass === "green" ? "bg-emerald-100 text-emerald-800" : riskClass === "yellow" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800";
  const label = riskClass === "green" ? "Надёжное" : riskClass === "yellow" ? "Средний риск" : "Рискованное";
  return (
    <span className={cls("px-2 py-1 text-xs rounded-full font-medium", color)}>
      {label} • {Math.round(score * 100)}%
    </span>
  );
}

function StatusDot({ st }: { st: ChecklistState }) {
  const map: Record<ChecklistState, string> = { OK: "bg-emerald-500", RISK: "bg-amber-500", NOGO: "bg-rose-600" };
  const title: Record<ChecklistState, string> = { OK: "ОК", RISK: "Риск", NOGO: "NO-GO" };
  return <span title={title[st]} className={cls("inline-block w-2.5 h-2.5 rounded-full", map[st])} />;
}

function Card({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cls("rounded-2xl border border-gray-200 shadow-sm bg-white", className)}>{children}</div>;
}

function SectionTitle({ children }: React.PropsWithChildren<{}>) {
  return <h2 className="text-lg font-semibold text-gray-800">{children}</h2>;
}

// --- Main App
export default function App() {
  const [tab, setTab] = useState<"portfolio" | "today" | "window" | "reserves" | "reports">("today");
  const [windows, setWindows] = useState<WindowPlan[]>(MOCK_WINDOWS);
  const [slots, setSlots] = useState<ReserveSlot[]>(MOCK_SLOTS);
  const [selected, setSelected] = useState<string | null>(windows[0]?.id ?? null);

  const current = useMemo(() => windows.find((w) => w.id === selected) || null, [windows, selected]);
  const clusterSlots = useMemo(() => (current ? slots.filter((s) => s.cluster === current.cluster && s.status === "Free") : []), [slots, current]);

  function substituteTo(slotId: string) {
    if (!current) return;
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    // Apply substitution inside the same cluster
    const newWindows = windows.map((w) =>
      w.id === current.id
        ? {
            ...w,
            startPlan: slot.start,
            endPlan: slot.end,
            status: "Moved",
            history: [
              ...w.history,
              {
                ts: new Date().toISOString(),
                actor: "Система",
                action: `Подстановка резерва ${slot.id}`,
                note: `Перенос в пределах кластера ${slot.cluster}`,
              },
            ],
          }
        : w
    );
    const newSlots = slots.map((s) => (s.id === slot.id ? { ...s, status: "Used" } : s));
    setWindows(newWindows);
    setSlots(newSlots);
    setTab("window");
  }

  function signChecklist(gate: "T72" | "T24" | "T6", role: string, value: ChecklistState) {
    if (!current) return;
    const newWindows = windows.map((w) => {
      if (w.id !== current.id) return w;
      const updated = { ...w, checklists: { ...w.checklists, [gate]: { ...w.checklists[gate], [role]: value } } };
      updated.history = [
        ...updated.history,
        { ts: new Date().toISOString(), actor: role, action: `${gate}: ${value}` },
      ];
      return updated;
    });
    setWindows(newWindows);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Topbar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600" />
            <div>
              <div className="text-sm text-gray-500">Пилот: Восточный полигон · Кластер</div>
              <div className="font-semibold">План vs Реальность — окна</div>
            </div>
          </div>
          <nav className="flex gap-1 text-sm">
            {[
              { k: "today", t: "Сегодня/Неделя" },
              { k: "portfolio", t: "Портфель месяца" },
              { k: "window", t: "Карточка окна" },
              { k: "reserves", t: "Кластеры/Резервы" },
              { k: "reports", t: "Отчёты" },
            ].map((x) => (
              <button
                key={x.k}
                onClick={() => setTab(x.k as any)}
                className={cls(
                  "px-3 py-2 rounded-xl",
                  tab === x.k ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                )}
              >
                {x.t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {tab === "today" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <SectionTitle>Ближайшие окна</SectionTitle>
              {windows
                .slice()
                .sort((a, b) => new Date(a.startPlan).getTime() - new Date(b.startPlan).getTime())
                .map((w) => (
                  <Card key={w.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm text-gray-500">{w.section} · {w.cluster}</div>
                        <div className="text-lg font-semibold">Окно {w.id} — {w.workType}</div>
                        <div className="text-sm text-gray-600">{fmt(w.startPlan)} → {fmt(w.endPlan)} · {durationMin(w.startPlan, w.endPlan)} мин</div>
                        <div className="mt-2 flex items-center gap-2">
                          <RiskBadge riskClass={w.riskClass} score={w.riskScore} />
                          {w.bufferMin ? (
                            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Буфер {w.bufferMin} мин</span>
                          ) : null}
                          {w.conflicts?.length ? (
                            <span className="text-xs text-rose-700 bg-rose-50 px-2 py-1 rounded-full">Конфликты: {w.conflicts.length}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">T−72 / T−24 / T−6</div>
                        <div className="flex items-center gap-3 justify-end mt-1">
                          <StatusDot st={w.checklists.T72.ЦДИ} />
                          <StatusDot st={w.checklists.T24.ЦДИ} />
                          <StatusDot st={w.checklists.T6.ЦДИ} />
                        </div>
                        <div className="mt-3 flex gap-2 justify-end">
                          <button className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm" onClick={() => { setSelected(w.id); setTab("window"); }}>Открыть</button>
                          <button className="px-3 py-2 rounded-xl bg-gray-100 text-sm" onClick={() => { setSelected(w.id); setTab("reserves"); }}>Резервы</button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
            <div className="space-y-4">
              <SectionTitle>Ближайшие резервы (по кластеру выбранного окна)</SectionTitle>
              {current ? (
                clusterSlots.length ? (
                  clusterSlots.map((s) => (
                    <Card key={s.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Слот {s.id} — {s.type === "hot" ? "Горячий 30–60 мин" : "Холодный 2–4 ч"}</div>
                          <div className="text-sm text-gray-600">{s.section}</div>
                          <div className="text-sm text-gray-600">{fmt(s.start)} → {fmt(s.end)} · {durationMin(s.start, s.end)} мин</div>
                        </div>
                        <button className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm" onClick={() => substituteTo(s.id)}>Подставить</button>
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card className="p-4"><div className="text-sm text-gray-600">Свободных резервов в этом кластере нет</div></Card>
                )
              ) : (
                <Card className="p-4"><div className="text-sm text-gray-600">Выберите окно слева</div></Card>
              )}
            </div>
          </div>
        )}

        {tab === "portfolio" && (
          <div className="space-y-4">
            <SectionTitle>Портфель месяца</SectionTitle>
            <Card className="p-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4">Окно</th>
                    <th className="py-2 pr-4">Время</th>
                    <th className="py-2 pr-4">Риск</th>
                    <th className="py-2 pr-4">Буфер</th>
                    <th className="py-2 pr-4">Конфликты</th>
                    <th className="py-2 pr-4">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {windows.map((w) => (
                    <tr key={w.id} className="border-t">
                      <td className="py-2 pr-4 font-medium">{w.id}<div className="text-gray-500 text-xs">{w.workType}</div></td>
                      <td className="py-2 pr-4">{fmt(w.startPlan)} → {fmt(w.endPlan)}</td>
                      <td className="py-2 pr-4"><RiskBadge riskClass={w.riskClass} score={w.riskScore} /></td>
                      <td className="py-2 pr-4">{w.bufferMin ? `${w.bufferMin} мин` : "—"}</td>
                      <td className="py-2 pr-4">{w.conflicts?.length ? w.conflicts.join(", ") : "—"}</td>
                      <td className="py-2 pr-4">
                        <button className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs mr-2" onClick={() => { setSelected(w.id); setTab("window"); }}>Открыть</button>
                        <button className="px-3 py-1.5 rounded-xl bg-gray-100 text-xs" onClick={() => { setSelected(w.id); setTab("reserves"); }}>Резервы</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">Портфель собран из «зелёных» и «жёлтых с буфером». «Красные» — исключены.</div>
              <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm">Собрать портфель</button>
            </Card>
          </div>
        )}

        {tab === "window" && current && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-gray-500">{current.section} · {current.cluster}</div>
                    <div className="text-lg font-semibold">Окно {current.id} — {current.workType}</div>
                    <div className="text-sm text-gray-600">План: {fmt(current.startPlan)} → {fmt(current.endPlan)} · {current.durationMin || durationMin(current.startPlan, current.endPlan)} мин</div>
                    <div className="mt-2 flex items-center gap-2">
                      <RiskBadge riskClass={current.riskClass} score={current.riskScore} />
                      {current.bufferMin ? (
                        <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Буфер {current.bufferMin} мин</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <SectionTitle>Факторы риска (пояснения)</SectionTitle>
                <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {current.factors.map((f, i) => (
                    <li key={i} className={cls("px-3 py-2 rounded-xl border text-sm", f.impact === "+" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")}> 
                      <div className="font-medium">{f.name}</div>
                      <div className="text-gray-600">{f.note}</div>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-4">
                <SectionTitle>История действий</SectionTitle>
                <ol className="mt-2 space-y-2 text-sm">
                  {current.history.slice().reverse().map((h, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 w-2 h-2 rounded-full bg-gray-400" />
                      <div>
                        <div className="text-gray-800">{h.action}</div>
                        <div className="text-gray-500">{fmt(h.ts)} · {h.actor} {h.note ? `· ${h.note}` : ""}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="p-4">
                <SectionTitle>GO/NO-GO чек-листы</SectionTitle>
                {["T72", "T24", "T6"].map((gate) => (
                  <div key={gate} className="mt-3">
                    <div className="text-xs text-gray-500">{gate.replace("T", "T−")}</div>
                    <div className="mt-1 grid grid-cols-4 gap-2 text-xs">
                      {Object.entries(current.checklists[gate as keyof WindowPlan["checklists"]]).map(([role, val]) => (
                        <div key={role} className="p-2 rounded-xl border bg-gray-50">
                          <div className="flex items-center justify-between mb-1"><span className="font-medium">{role}</span><StatusDot st={val as ChecklistState} /></div>
                          <div className="flex gap-1">
                            {["OK", "RISK", "NOGO"].map((v) => (
                              <button key={v}
                                className={cls("px-2 py-1 rounded-md", (val as string) === v ? "bg-gray-900 text-white" : "bg-white border")}
                                onClick={() => signChecklist(gate as any, role, v as ChecklistState)}
                              >{v}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>

              <Card className="p-4">
                <SectionTitle>Резервные слоты кластера</SectionTitle>
                {clusterSlots.length ? (
                  <div className="mt-2 space-y-2">
                    {clusterSlots.map((s) => (
                      <div key={s.id} className="p-3 rounded-xl border flex items-center justify-between">
                        <div>
                          <div className="font-medium">{s.id} — {s.type === "hot" ? "Горячий" : "Холодный"}</div>
                          <div className="text-sm text-gray-600">{fmt(s.start)} → {fmt(s.end)} · {durationMin(s.start, s.end)} мин</div>
                        </div>
                        <button className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm" onClick={() => substituteTo(s.id)}>Подставить</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 mt-2">Свободных слотов нет</div>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "reserves" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-4">
                <SectionTitle>Карта кластера (схема)</SectionTitle>
                <div className="mt-2 grid grid-cols-12 gap-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-xl flex items-center justify-center text-xs border bg-gradient-to-br from-gray-50 to-white">ПК {240 + i}</div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-gray-500">* Макетная схема: для мокапа без геопривязки</div>
              </Card>
            </div>
            <div className="space-y-2">
              <SectionTitle>Слоты резерва</SectionTitle>
              {slots.filter((s) => s.status === "Free").map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{s.id} — {s.cluster}</div>
                      <div className="text-sm text-gray-600">{s.section}</div>
                      <div className="text-sm text-gray-600">{fmt(s.start)} → {fmt(s.end)} ({durationMin(s.start, s.end)} мин)</div>
                    </div>
                    <span className={cls("px-2 py-1 rounded-full text-xs", s.type === "hot" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800")}>{s.type === "hot" ? "горячий" : "холодный"}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-4">
                <SectionTitle>Совпадение план-факт (до/после)</SectionTitle>
                <div className="mt-2 h-48 rounded-xl bg-[repeating-linear-gradient(90deg,#eef,0, #eef 10px,#dde 10px,#dde 20px)] flex items-end gap-2 p-3">
                  <div className="w-1/2 h-[60%] bg-rose-300 rounded-xl" title="Было 62%" />
                  <div className="w-1/2 h-[75%] bg-emerald-400 rounded-xl" title="Стало 75%" />
                </div>
                <div className="text-xs text-gray-500 mt-2">* Макетные цифры для демонстрации. В финале подставляем реальные из бэктеста.</div>
              </Card>

              <Card className="p-4">
                <SectionTitle>Pareto причин отмен</SectionTitle>
                <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                  <li>Неподтверждённая бригада (−)</li>
                  <li>Отказ путевой техники (−)</li>
                  <li>Ограничения пропускной способности (−)</li>
                  <li>Погода (−)</li>
                </ul>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="p-4">
                <SectionTitle>KPI (пилот)</SectionTitle>
                <ul className="mt-2 text-sm space-y-1">
                  <li><span className="font-medium">Совпадение план-факт:</span> +5 п.п.</li>
                  <li><span className="font-medium">Отмены (T−24..T0):</span> −18%</li>
                  <li><span className="font-medium">Простой ресурсов:</span> −11% ч</li>
                </ul>
              </Card>
              <Card className="p-4">
                <SectionTitle>Кейсы (3 шт.)</SectionTitle>
                <ol className="mt-2 text-sm list-decimal pl-5 space-y-1">
                  <li>A-173: риск на T−24 → подстановка R-101 → выполнено</li>
                  <li>B-021: зелёное окно → выполнено без переносов</li>
                  <li>C-309: красное окно → исключено из портфеля</li>
                </ol>
              </Card>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-gray-500">Мокап: «План vs Реальность». Команда «От Винта!» · 2025</footer>
    </div>
  );
}
