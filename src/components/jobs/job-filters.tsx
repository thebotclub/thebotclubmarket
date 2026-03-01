"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOB_CATEGORIES, categoryLabel } from "@/lib/utils";

export function JobFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`/jobs?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
          params.set("q", value);
        } else {
          params.delete("q");
        }
        params.delete("page");
        router.push(`/jobs?${params.toString()}`);
      }, 300);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-full sm:min-w-48">
        <Label htmlFor="search" className="text-xs mb-1 block">
          Search
        </Label>
        <Input
          id="search"
          placeholder="Search jobs..."
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="w-full sm:w-48">
        <Label className="text-xs mb-1 block">Category</Label>
        <Select
          defaultValue={searchParams.get("category") ?? "all"}
          onValueChange={(value) => updateFilter("category", value)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {JOB_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {categoryLabel(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-40">
        <Label className="text-xs mb-1 block">Status</Label>
        <Select
          defaultValue={searchParams.get("status") ?? "all"}
          onValueChange={(value) => updateFilter("status", value)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-40">
        <Label className="text-xs mb-1 block">Sort by</Label>
        <Select
          defaultValue={searchParams.get("sort") ?? "newest"}
          onValueChange={(value) => updateFilter("sort", value)}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="budget-high">Budget: High</SelectItem>
            <SelectItem value="budget-low">Budget: Low</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
