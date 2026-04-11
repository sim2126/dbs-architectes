"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Image,
  Brain,
  Tag,
  Palette,
  Layers,
  Grid3x3,
  Sliders,
  X,
  ChevronDown,
  Sparkles,
  Building2,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";

const SAMPLE_IMAGES = [
  {
    id: "1",
    title: "Villa Moderna - Facciata Nord",
    type: "render",
    tags: ["villa", "moderno", "legno", "vetro"],
    colors: ["bianco", "grigio", "marrone"],
    materials: ["Legno", "Vetro", "Cemento"],
    floors: 2,
    year: 2024,
    style: "Moderno",
    shape: "Rettangolare",
    url: "",
    project: "DBS328",
  },
  {
    id: "2",
    title: "Condominio - Vista 3D",
    type: "render",
    tags: ["condominio", "urbano", "calcestruzzo"],
    colors: ["grigio", "bianco"],
    materials: ["Cemento", "Vetro"],
    floors: 6,
    year: 2023,
    style: "Contemporaneo",
    shape: "L-Form",
    url: "",
    project: "DBS283-10",
  },
  {
    id: "3",
    title: "Villa Bifamiliare - Render Esterno",
    type: "render",
    tags: ["bifamiliare", "naturale", "pietra"],
    colors: ["beige", "verde", "grigio"],
    materials: ["Pietra", "Legno", "Intonaco"],
    floors: 3,
    year: 2024,
    style: "Tradizionale",
    shape: "Compatto",
    url: "",
    project: "DBS2024-66",
  },
  {
    id: "4",
    title: "Villa Montana - Vista Sud",
    type: "facade",
    tags: ["montagna", "legno", "falde"],
    colors: ["marrone", "grigio"],
    materials: ["Legno", "Pietra"],
    floors: 2,
    year: 2022,
    style: "Alpino",
    shape: "A falde",
    url: "",
    project: "DBS182",
  },
];

const FILTER_COLORS = ["bianco", "grigio", "marrone", "beige", "nero", "verde", "blu"];
const FILTER_MATERIALS = ["Legno", "Vetro", "Cemento", "Pietra", "Intonaco", "Acciaio", "Rame"];
const FILTER_SHAPES = ["Rettangolare", "L-Form", "Compatto", "A falde", "Torre", "Perimetrale"];

export function GalleryView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [aiSearch, setAiSearch] = useState("");
  const [aiSearched, setAiSearched] = useState(false);
  const [filters, setFilters] = useState({
    floors: [0, 12],
    colors: [] as string[],
    materials: [] as string[],
    shapes: [] as string[],
    yearFrom: "",
    yearTo: "",
    type: "all",
  });

  const toggleArrayFilter = (key: "colors" | "materials" | "shapes", value: string) => {
    const arr = filters[key];
    setFilters({
      ...filters,
      [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    });
  };

  const handleAiSearch = () => {
    setAiSearched(true);
    setTimeout(() => setAiSearched(false), 100);
  };

  const filteredImages = SAMPLE_IMAGES.filter((img) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      img.title.toLowerCase().includes(q) ||
      img.tags.some((t) => t.toLowerCase().includes(q)) ||
      img.materials.some((m) => m.toLowerCase().includes(q));
    const matchesColors =
      filters.colors.length === 0 ||
      filters.colors.some((c) => img.colors.includes(c));
    const matchesMaterials =
      filters.materials.length === 0 ||
      filters.materials.some((m) => img.materials.includes(m));
    const matchesShapes =
      filters.shapes.length === 0 || filters.shapes.includes(img.shape);
    return matchesSearch && matchesColors && matchesMaterials && matchesShapes;
  });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Filters panel */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-border bg-card overflow-hidden shrink-0"
          >
            <div className="p-4 h-full overflow-y-auto">
              <h3 className="text-sm font-semibold mb-4">Filtri AI</h3>

              {/* Footprint size slider */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Numero Piani
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="12"
                    value={filters.floors[1]}
                    onChange={(e) =>
                      setFilters({ ...filters, floors: [0, parseInt(e.target.value)] })
                    }
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-8">{filters.floors[1]}p</span>
                </div>
              </div>

              {/* Colors */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Colori Dominanti
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => toggleArrayFilter("colors", color)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        filters.colors.includes(color)
                          ? "bg-foreground text-background border-foreground"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Materials */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Materiali
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_MATERIALS.map((mat) => (
                    <button
                      key={mat}
                      onClick={() => toggleArrayFilter("materials", mat)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        filters.materials.includes(mat)
                          ? "bg-foreground text-background border-foreground"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {mat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shapes */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Forma
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_SHAPES.map((shape) => (
                    <button
                      key={shape}
                      onClick={() => toggleArrayFilter("shapes", shape)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        filters.shapes.includes(shape)
                          ? "bg-foreground text-background border-foreground"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year range */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Year
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="From"
                    type="number"
                    value={filters.yearFrom}
                    onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value })}
                    className="text-xs h-8"
                  />
                  <Input
                    placeholder="To"
                    type="number"
                    value={filters.yearTo}
                    onChange={(e) => setFilters({ ...filters, yearTo: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-foreground rounded-lg">
                <Image className="w-4 h-4 text-background" />
              </div>
              <div>
                <h1 className="text-base font-bold">Visual Gallery AI</h1>
                <p className="text-xs text-muted-foreground">
                  AI-powered visual repository
                </p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="info" className="text-xs">
                <Brain className="w-3 h-3 mr-1" />
                AI Auto-Tag
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* AI Natural Language Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="AI Query: 'Buildings 4-6 floors with warm tones built between 2020-2025'"
                value={aiSearch}
                onChange={(e) => setAiSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleAiSearch} size="sm" className="gap-1.5">
              <Brain className="w-4 h-4" />
              Search with AI
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, tag, material..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              {filteredImages.length} renders found
            </span>
          </div>
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* AI Example query banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-100 dark:border-blue-900"
          >
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900 rounded-lg shrink-0">
                <Brain className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Example AI Query
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5 italic">
                  &ldquo;Find buildings 4-6 floors with warm tones (or colors like grey and green) built between 2020-2025&rdquo;
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  → Returns ranked matches instantly with cross-referenced metadata
                </p>
              </div>
            </div>
          </motion.div>

          {/* Image grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredImages.map((img, i) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                className="group cursor-pointer"
              >
                <div className="aspect-[4/3] bg-gradient-to-br from-muted to-muted/50 rounded-xl overflow-hidden border border-border relative hover:shadow-lg transition-shadow">
                  {/* Placeholder for render */}
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-muted-foreground/30" />
                  </div>

                  {/* AI tags overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-white text-xs font-medium truncate">{img.title}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {img.materials.slice(0, 2).map((m) => (
                        <span
                          key={m}
                          className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Floor count badge */}
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {img.floors}P
                  </div>
                </div>

                <div className="mt-2">
                  <p className="text-xs font-medium truncate">{img.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-muted-foreground">{img.year}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="text-[10px] text-muted-foreground">{img.project}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {img.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Upload placeholder */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="aspect-[4/3] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-muted-foreground transition-colors"
            >
              <Image className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center px-2">
                Upload new images
              </p>
            </motion.div>
          </div>

          {/* Hidden patterns section */}
          <div className="mt-8">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Hidden Patterns Detected by AI
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: "Recurring Facade Rhythms",
                  desc: "Vertical modules with regular windows predominate in single-family villas",
                  count: "12 occurrences",
                  color: "from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20",
                },
                {
                  title: "Preferred Material Combinations",
                  desc: "Wood + stone in alpine residences · Concrete + glass in urban areas",
                  count: "8 combinations",
                  color: "from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20",
                },
              ].map((pattern) => (
                <div
                  key={pattern.title}
                  className={`p-4 rounded-xl bg-gradient-to-br ${pattern.color} border border-border`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold">{pattern.title}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {pattern.count}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{pattern.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
