"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSearch,
  Brain,
  Filter,
  Building2,
  Grid,
  LayoutGrid,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Home,
  Map,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPOLOGY_ARCHETYPES = [
  {
    id: "double_loaded",
    name: "Double-Loaded Corridor",
    efficiency: "HIGH",
    ratio: "0.75-0.82",
    desc: "Apartments on both sides of the central corridor. Optimal for high density.",
    color: "bg-blue-500",
    lightColor: "bg-blue-50 dark:bg-blue-950/20",
    units: "6-12 units/floor",
  },
  {
    id: "point_tower",
    name: "Point Tower",
    efficiency: "VERY HIGH",
    ratio: "0.82-0.90",
    desc: "Tower with central stairwell and radially distributed apartments.",
    color: "bg-emerald-500",
    lightColor: "bg-emerald-50 dark:bg-emerald-950/20",
    units: "4-8 units/floor",
  },
  {
    id: "perimeter_block",
    name: "Perimeter Block",
    efficiency: "MEDIUM",
    ratio: "0.65-0.75",
    desc: "Building that follows the plot perimeter with an internal courtyard.",
    color: "bg-amber-500",
    lightColor: "bg-amber-50 dark:bg-amber-950/20",
    units: "8-16 units/floor",
  },
];

const SAMPLE_PLANS = [
  {
    id: "1",
    title: "Standard Floor Plan - DBS283",
    type: "floor_plan",
    floors: 4,
    siteArea: 1200,
    buildingArea: 680,
    typology: "Condominiums",
    apartmentMix: "3x3.5rm, 1x2.5rm",
    shape: "Rectangular",
    year: 2023,
    project: "DBS283-10",
  },
  {
    id: "2",
    title: "Site Plan - DBS328",
    type: "site_plan",
    floors: 2,
    siteArea: 850,
    buildingArea: 320,
    typology: "Single-family villas",
    apartmentMix: "1x5.5rm",
    shape: "L-Form",
    year: 2024,
    project: "DBS328",
  },
  {
    id: "3",
    title: "3.5-Room Apartment Floor Plan",
    type: "floor_plan",
    floors: 1,
    siteArea: 0,
    buildingArea: 72,
    typology: "Condominiums",
    apartmentMix: "1x3.5rm",
    shape: "Compact",
    year: 2023,
    project: "DBS283-10",
  },
];

export default function PlanningAIPage() {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    siteArea: "",
    floors: "",
    units: "",
    typology: "",
    yearFrom: "",
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setAnalyzing(false);
    setAnalyzed(true);
  };

  return (
    <div className="flex flex-col h-screen overflow-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-foreground rounded-lg">
            <FileSearch className="w-4 h-4 text-background" />
          </div>
          <div>
            <h1 className="text-base font-bold">Planning AI</h1>
            <p className="text-xs text-muted-foreground">
              Every DBS floor plan, vectorized, tagged and instantly searchable
            </p>
          </div>
          <Badge variant="purple" className="ml-auto text-xs">
            <Brain className="w-3 h-3 mr-1" />
            AI Powered
          </Badge>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* AI Filter Interface */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-purple-500" />
              <h2 className="text-sm font-semibold">AI Filter Criteria</h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Map className="w-3 h-3" />
                  Site Area (m²)
                </label>
                <Input
                  placeholder="e.g. 2000"
                  type="number"
                  value={filters.siteArea}
                  onChange={(e) => setFilters({ ...filters, siteArea: e.target.value })}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" />
                  Building Depth
                </label>
                <Input
                  placeholder="e.g. 15m"
                  value={filters.floors}
                  onChange={(e) => setFilters({ ...filters, floors: e.target.value })}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Home className="w-3 h-3" />
                  Number of Units
                </label>
                <Input
                  placeholder="e.g. 8-12"
                  value={filters.units}
                  onChange={(e) => setFilters({ ...filters, units: e.target.value })}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3" />
                  Apartment Mix
                </label>
                <Input
                  placeholder="e.g. 3x3.5rm, 1x2.5rm"
                  value={filters.typology}
                  onChange={(e) => setFilters({ ...filters, typology: e.target.value })}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Grid className="w-3 h-3" />
                  Typology
                </label>
                <Select
                  value={filters.typology || "all"}
                  onValueChange={(v) => setFilters({ ...filters, typology: v === "all" ? "" : v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All typologies</SelectItem>
                    <SelectItem value="Ville monofamiliari">Single-family villas</SelectItem>
                    <SelectItem value="Ville bifamiliari">Semi-detached villas</SelectItem>
                    <SelectItem value="Condomini">Condominiums</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Year from</label>
                <Input
                  placeholder="e.g. 2018"
                  type="number"
                  value={filters.yearFrom}
                  onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>

            {/* AI Query example */}
            <div className="mt-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900">
              <p className="text-xs text-purple-700 dark:text-purple-300">
                <strong>Example AI query:</strong> Find 3-floor buildings with 6-8 units per floor after 2018 with 2000m² area. Apartment mix: 3x3.5rm and 1x2.5rm
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <Button onClick={handleAnalyze} disabled={analyzing} className="gap-2">
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                ) : (
                  <><Brain className="w-4 h-4" /> Analyze with AI</>
                )}
              </Button>
              <Button variant="outline" className="gap-2">
                <FileSearch className="w-4 h-4" />
                Search Floor Plans
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Archetype Analysis */}
        <AnimatePresence>
          {analyzed && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold">Clustering Algorithms & Archetypes</h2>
                <Badge variant="success" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Analysis complete
                </Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {TYPOLOGY_ARCHETYPES.map((arch, i) => (
                  <motion.div
                    key={arch.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card
                      className={`cursor-pointer border-2 transition-all ${
                        selectedArchetype === arch.id
                          ? "border-foreground shadow-lg"
                          : "border-border hover:border-muted-foreground"
                      }`}
                      onClick={() =>
                        setSelectedArchetype(
                          selectedArchetype === arch.id ? null : arch.id
                        )
                      }
                    >
                      <CardContent className="p-4">
                        {/* Architecture diagram placeholder */}
                        <div className={`w-full h-24 rounded-lg ${arch.lightColor} flex items-center justify-center mb-3 border border-border`}>
                          <Grid className="w-8 h-8 text-muted-foreground/30" />
                        </div>

                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-semibold">{arch.name}</p>
                          <Badge
                            variant={arch.efficiency === "VERY HIGH" ? "success" : arch.efficiency === "HIGH" ? "info" : "warning"}
                            className="text-[10px]"
                          >
                            {arch.efficiency}
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground mb-3">{arch.desc}</p>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Efficiency Metric</span>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-emerald-500" />
                            </div>
                          </div>
                          <div className="text-xs">
                            <span className="font-semibold">Net-to-Gross Ratio:</span>{" "}
                            <span className="text-muted-foreground">{arch.ratio}</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-semibold">Units:</span>{" "}
                            <span className="text-muted-foreground">{arch.units}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mt-3 p-3 bg-muted rounded-lg">
                <strong>HIGHLIGHTS:</strong> Automatic identification of optimal typologies based on past project performance and design constraints.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floor plans library */}
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileSearch className="w-4 h-4" />
            Floor Plan Library
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {SAMPLE_PLANS.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -2 }}
                className="group cursor-pointer"
              >
                <div className="aspect-[4/3] bg-muted rounded-xl border border-border flex items-center justify-center hover:shadow-md transition-shadow relative overflow-hidden">
                  <Grid className="w-10 h-10 text-muted-foreground/20" />
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {plan.type === "floor_plan" ? "Floor Plan" : "Site Plan"}
                    </Badge>
                  </div>
                  {plan.floors > 0 && (
                    <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      {plan.floors}P
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="sm" variant="outline" className="text-white border-white hover:bg-white/20">
                      View
                    </Button>
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xs font-medium truncate">{plan.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {plan.siteArea > 0 && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                        {plan.siteArea}m² site
                      </span>
                    )}
                    {plan.buildingArea > 0 && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                        {plan.buildingArea}m²
                      </span>
                    )}
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      {plan.year}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{plan.project}</p>
                </div>
              </motion.div>
            ))}

            {/* Upload placeholder */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="aspect-[4/3] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-muted-foreground transition-colors"
            >
              <FileSearch className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center px-2">
                Upload new floor plan
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
