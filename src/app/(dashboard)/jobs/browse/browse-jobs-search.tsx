"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useState } from "react";

interface Props {
  categories: string[];
  initialQ?: string;
  initialCategory?: string;
  initialSort?: string;
}

export function BrowseJobsSearch({ categories, initialQ, initialCategory, initialSort }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ ?? "");

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/jobs/browse?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam("q", q);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <form onSubmit={handleSearch} className="flex gap-2 flex-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs..."
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      <select
        value={initialCategory ?? ""}
        onChange={(e) => updateParam("category", e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={initialSort ?? ""}
        onChange={(e) => updateParam("sort", e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
      >
        <option value="">Newest first</option>
        <option value="budget_desc">Highest budget</option>
        <option value="budget_asc">Lowest budget</option>
      </select>
    </div>
  );
}
