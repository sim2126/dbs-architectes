"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Building2,
  Check,
  FileSearch,
  Grid3X3,
  Home,
  Layers3,
  Loader2,
  Map,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ARCHETYPES = [
  {
    id: "double-loaded",
    name: "Double-loaded corridor",
    efficiency: "High",
    ratio: "0.75 - 0.82",
    units: "6 - 12 units / floor",
    description: "Efficient for medium-density residential programs with regular circulation logic.",
    strength: "Strong balance between density and clarity",
    accent: "from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20",
  },
  {
    id: "point-tower",
    name: "Point tower",
    efficiency: "Very high",
    ratio: "0.82 - 0.90",
    units: "4 - 8 units / floor",
    description: "Centralized core with radial apartments. Suitable for compact urban sites.",
    strength: "Best raw efficiency on constrained plots",
    accent: "from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20",
  },
  {
    id: "perimeter-block",
    name: "Perimeter block",
    efficiency: "Medium",
    ratio: "0.65 - 0.75",
    units: "8 - 16 units / floor",
    description: "Courtyard-based organization that works well for larger sites and perimeter conditions.",
    strength: "Strong urban presence and shared-space potential",
    accent: "from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20",
  },
];

const SAMPLE_PLANS = [
  {
    id: "1",
    title: "Standard floor plate - DBS283",
    type: "Floor plan",
    siteArea: 1200,
    buildingArea: 680,
    mix: "3x 3.5-room, 1x 2.5-room",
    typology: "Condominium",
    project: "DBS283-10",
    note: "Useful precedent for compact mid-density layouts",
  },
  {
    id: "2",
    title: "Site strategy - DBS328",
    type: "Site plan",
    siteArea: 850,
    buildingArea: 320,
    mix: "1x 5.5-room villa",
    typology: "Single-family villa",
    project: "DBS328",
    note: "Good slope-sensitive reference with a clean footprint",
  },
  {
    id: "3",
    title: "Apartment reference - 3.5-room",
    type: "Floor plan",
    siteArea: 0,
    buildingArea: 72,
    mix: "1x 3.5-room unit",
    typology: "Apartment unit",
    project: "DBS283-10",
    note: "Useful for internal sizing standards and mix logic",
  },
];

export default function PlanningAIPage() {
  const [query, setQuery] = useState({
    siteArea: "",
    depth: "",
    units: "",
    mix: "",
    typology: "",
    yearFrom: "",
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function runAnalysis() {
    setAnalyzing(true);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    setAnalyzing(false);
    setReady(true);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f9fbff_0%,#ffffff_36%,#f7f7f8_100%)] p-6">
      <div className="space-y-6">
        <Card className="overflow-hidden border-white/80 bg-white/90 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
          <CardContent className="p-0">
            <div className="bg-[linear-gradient(135deg,#0f172a_0%,#155e75_54%,#0f766e_100%)] px-6 py-8 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <Badge className="bg-white/12 text-[11px] text-white">Planning intelligence</Badge>
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight">Planning AI</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-white/74">
                    A precedent and recommendation engine for floor plans, layout archetypes, site strategies, and apartment mix decisions.
                  </p>
                </div>
                <Badge variant="success" className="text-xs">
                  Recommendation mode
                </Badge>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  { label: "Plans indexed", value: "860" },
                  { label: "Archetypes clustered", value: "24" },
                  { label: "Mix patterns recognized", value: "73" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="mt-1 text-sm text-white/75">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Site area" icon={Map}>
                <Input
                  value={query.siteArea}
                  onChange={(event) => setQuery((current) => ({ ...current, siteArea: event.target.value }))}
                  placeholder="e.g. 2000 m2"
                />
              </Field>
              <Field label="Building depth" icon={Building2}>
                <Input
                  value={query.depth}
                  onChange={(event) => setQuery((current) => ({ ...current, depth: event.target.value }))}
                  placeholder="e.g. 15 m"
                />
              </Field>
              <Field label="Units" icon={Home}>
                <Input
                  value={query.units}
                  onChange={(event) => setQuery((current) => ({ ...current, units: event.target.value }))}
                  placeholder="e.g. 8 to 12"
                />
              </Field>
              <Field label="Apartment mix" icon={Layers3}>
                <Input
                  value={query.mix}
                  onChange={(event) => setQuery((current) => ({ ...current, mix: event.target.value }))}
                  placeholder="e.g. 3x 3.5-room, 1x 2.5-room"
                />
              </Field>
              <Field label="Typology" icon={Grid3X3}>
                <Select
                  value={query.typology || "all"}
                  onValueChange={(value) =>
                    setQuery((current) => ({ ...current, typology: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select typology" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All typologies</SelectItem>
                    <SelectItem value="single-family">Single-family villa</SelectItem>
                    <SelectItem value="semi-detached">Semi-detached villa</SelectItem>
                    <SelectItem value="condominium">Condominium</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Year from" icon={TrendingUp}>
                <Input
                  value={query.yearFrom}
                  onChange={(event) => setQuery((current) => ({ ...current, yearFrom: event.target.value }))}
                  placeholder="e.g. 2019"
                />
              </Field>
            </div>

            <div className="border-t border-border px-6 py-5">
              <div className="rounded-2xl border border-purple-100 bg-purple-50/80 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">Example AI prompt</p>
                </div>
                <p className="mt-2 text-sm leading-7 text-purple-800 dark:text-purple-200">
                  Find condominium precedents after 2019 with 6 to 8 units, compact circulation, and a mix of 3.5-room and 2.5-room apartments.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={runAnalysis} className="rounded-2xl">
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing precedents
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      Analyze with AI
                    </>
                  )}
                </Button>
                <Button variant="outline" className="rounded-2xl">
                  <FileSearch className="mr-2 h-4 w-4" />
                  Search plan library
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <AnimatePresence>
          {ready && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="space-y-6"
            >
              <div className="grid gap-4 md:grid-cols-3">
                {ARCHETYPES.map((archetype, index) => (
                  <motion.div
                    key={archetype.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                  >
                    <Card
                      className={`cursor-pointer border-white/80 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.05)] transition-all ${
                        selectedArchetype === archetype.id ? "ring-2 ring-slate-900/70" : ""
                      }`}
                      onClick={() =>
                        setSelectedArchetype((current) => (current === archetype.id ? null : archetype.id))
                      }
                    >
                      <CardContent className="p-5">
                        <div className={`rounded-2xl bg-gradient-to-br ${archetype.accent} p-4`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold">{archetype.name}</p>
                            <Badge variant="secondary" className="text-[10px]">
                              {archetype.efficiency}
                            </Badge>
                          </div>
                          <div className="mt-5 flex h-28 items-center justify-center rounded-2xl border border-border/60 bg-white/45 dark:bg-black/10">
                            <Grid3X3 className="h-8 w-8 text-slate-500" />
                          </div>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-muted-foreground">{archetype.description}</p>

                        <div className="mt-4 space-y-3 text-sm">
                          <Metric label="Net-to-gross ratio" value={archetype.ratio} />
                          <Metric label="Typical range" value={archetype.units} />
                          <Metric label="Why it fits" value={archetype.strength} />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <Card className="border-white/80 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                <CardContent className="grid gap-4 p-6 md:grid-cols-3">
                  {[
                    {
                      title: "Recommendation logic",
                      text: "Planning AI ranks archetypes by efficiency, density fit, apartment mix compatibility, and precedent similarity.",
                    },
                    {
                      title: "What the user sees",
                      text: "A short recommendation, supporting rationale, and the closest matching DBS precedents for immediate review.",
                    },
                    {
                      title: "Why it matters",
                      text: "This turns archive material into a reusable planning asset instead of static documentation.",
                    },
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-semibold">{item.title}</p>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <div className="mb-4 flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Plan library</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SAMPLE_PLANS.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <Card className="overflow-hidden border-white/80 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                  <CardContent className="p-0">
                    <div className="flex aspect-[4/3] items-center justify-center border-b border-border bg-[linear-gradient(135deg,#eef2ff_0%,#f7fafc_50%,#edf7f1_100%)]">
                      <Grid3X3 className="h-10 w-10 text-slate-400" />
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{plan.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {plan.project} · {plan.typology}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {plan.type}
                        </Badge>
                      </div>

                      <div className="mt-4 space-y-3">
                        <Metric label="Site area" value={plan.siteArea > 0 ? `${plan.siteArea} m2` : "N/A"} />
                        <Metric label="Building area" value={`${plan.buildingArea} m2`} />
                        <Metric label="Apartment mix" value={plan.mix} />
                      </div>

                      <div className="mt-4 rounded-2xl border border-border bg-card p-3">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            AI note
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{plan.note}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="text-right text-sm text-slate-700">{value}</p>
    </div>
  );
}
