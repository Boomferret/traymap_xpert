"use client";

import React, { useCallback, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { TRAY_LEVELS, DEFAULT_TRAY_LEVEL } from "@/constants/trayLevels";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const labelForCable = (cable) => {
  if (!cable) return "";
  if (cable.cableLabel) return cable.cableLabel;
  const source = cable.source || "?";
  const target = cable.target || "?";
  return `${source} ↔ ${target}`;
};



export const CableRunsPanel = ({ cables = [], onTrayLevelChange, machineAliases = {}, className = "" }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const resolveEndpoint = useCallback((name) => {
    if (!name) return "?";
    const trimmed = String(name).trim();
    if (!trimmed) return "?";
    if (trimmed === "?") return trimmed;
    const lower = trimmed.toLowerCase();
    const canonical = machineAliases?.[trimmed] ?? machineAliases?.[lower];
    return canonical || trimmed;
  }, [machineAliases]);
  const cablesWithDefaults = useMemo(
    () =>
      cables.map((cable) => ({
        ...cable,
        trayLevel: cable?.trayLevel || DEFAULT_TRAY_LEVEL
      })),
    [cables]
  );

  const runs = useMemo(() => {
    const runsMap = new Map();

    cablesWithDefaults.forEach((cable) => {
      const rawSource = cable?.source ?? cable?.originalSource ?? "?";
      const rawTarget = cable?.target ?? cable?.originalTarget ?? "?";

      const resolvedSource = resolveEndpoint(rawSource);
      const resolvedTarget = resolveEndpoint(rawTarget);

      if (!resolvedSource || !resolvedTarget) {
        return;
      }

      if (resolvedSource === resolvedTarget) {
        return;
      }

      const sortedEndpoints = [resolvedSource, resolvedTarget].sort((a, b) =>
        a.localeCompare(b)
      );
      const runKey = `${sortedEndpoints[0]}__${sortedEndpoints[1]}`;

      if (!runsMap.has(runKey)) {
        runsMap.set(runKey, {
          key: runKey,
          endpoints: sortedEndpoints,
          cables: [],
          levelCounts: new Map(),
          functionSet: new Set(),
          networkSet: new Set(),
          endpointVariants: new Set(sortedEndpoints)
        });
      }

      const run = runsMap.get(runKey);
      const level = cable.trayLevel || DEFAULT_TRAY_LEVEL;

      run.cables.push(cable);
      run.levelCounts.set(level, (run.levelCounts.get(level) || 0) + 1);

      const variantCandidates = [
        resolvedSource,
        resolvedTarget,
        rawSource,
        rawTarget,
        cable?.originalSource,
        cable?.originalTarget
      ];

      variantCandidates.forEach((name) => {
        if (!name) return;
        const trimmedName = String(name).trim();
        if (trimmedName) {
          run.endpointVariants.add(trimmedName);
        }
      });

      if (cable.cableFunction) {
        run.functionSet.add(cable.cableFunction);
      }

      if (cable.network) {
        run.networkSet.add(cable.network);
      }
    });

    return Array.from(runsMap.values())
      .map((run) => {
        const sortedLevels = Array.from(run.levelCounts.entries()).sort((a, b) => b[1] - a[1]);
        const preferredLevel =
          sortedLevels.length > 0 ? sortedLevels[0][0] : DEFAULT_TRAY_LEVEL;

        return {
          key: run.key,
          label: `${run.endpoints[0]} ↔ ${run.endpoints[1]}`,
          trayLevel: preferredLevel,
          hasMixedLevels: run.levelCounts.size > 1,
          cableCount: run.cables.length,
          cables: run.cables,
          functions: Array.from(run.functionSet).sort((a, b) => a.localeCompare(b)),
          networks: Array.from(run.networkSet).sort((a, b) => a.localeCompare(b)),
          endpointVariants: Array.from(run.endpointVariants)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cablesWithDefaults, resolveEndpoint]);

  const levelCounts = useMemo(() => {
    return runs.reduce(
      (acc, run) => {
        const level = run.trayLevel || DEFAULT_TRAY_LEVEL;
        acc[level] = (acc[level] || 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0 }
    );
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (!searchTerm.trim()) {
      return runs;
    }

    const term = searchTerm.toLowerCase();

    return runs.filter((run) => {
      if (run.label.toLowerCase().includes(term)) return true;
      if (run.endpointVariants?.some((variant) => variant.toLowerCase().includes(term))) return true;
      if (run.functions.some((fn) => fn.toLowerCase().includes(term))) return true;
      if (run.networks.some((network) => network.toLowerCase().includes(term))) return true;

      return run.cables.some((cable) => labelForCable(cable).toLowerCase().includes(term));
    });
  }, [runs, searchTerm]);

  return (
    <Card
      className={cn(
        "bg-white border rounded-lg shadow-sm flex flex-col h-full transition-all duration-200 overflow-hidden",
        isCollapsed ? "w-12 items-center" : "w-72",
        className
      )}
    >
      <div
        className={cn(
          "w-full transition-all duration-200",
          isCollapsed ? "p-2" : "p-4 border-b space-y-2"
        )}
      >
        <div
          className={cn(
            "flex items-center",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200 transition"
            aria-label={isCollapsed ? "Expand cable runs panel" : "Collapse cable runs panel"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          {!isCollapsed && (
            <div className="flex items-center justify-between gap-2 flex-1 pl-2">
              <div className="text-sm font-medium">Cable Runs</div>
              <Badge variant="secondary" className="text-xs">
                {levelCounts.total}
              </Badge>
            </div>
          )}
        </div>

        {isCollapsed ? (
          <div className="mt-2 flex flex-col items-center gap-1 text-[10px] text-gray-600">
            <span className="uppercase tracking-wide">Runs</span>
            <span className="font-semibold text-gray-800">{levelCounts.total}</span>
          </div>
        ) : (
          <>
            <div className="flex gap-1 flex-wrap">
              {TRAY_LEVELS.map((level) => (
                <Badge key={level.value} variant="outline" className="text-[10px]">
                  {level.label}
                  <span className="ml-1 font-semibold">
                    {levelCounts[level.value] || 0}
                  </span>
                </Badge>
              ))}
            </div>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search run, function, or network"
              className="h-8 text-xs"
            />
          </>
        )}
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredRuns.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">
              {runs.length === 0 ? "No cable runs available" : "No cable runs match your search"}
            </div>
          ) : (
            filteredRuns.map((run) => (
              <div
                key={run.key}
                className="border rounded-md p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate" title={run.label}>
                    {run.label}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {run.cableCount} cable{run.cableCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Level
                  </div>
                  <Select
                    value={run.trayLevel}
                    onValueChange={(value) => onTrayLevelChange && onTrayLevelChange(run, value)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAY_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value} className="text-xs">
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {run.hasMixedLevels && (
                  <div className="mt-1 text-[11px] text-amber-600">
                    Currently mixed tray levels across cables
                  </div>
                )}
                {run.functions.length > 0 && (
                  <div className="mt-2 text-[11px] text-gray-500">
                    Functions: <span className="text-gray-700">{run.functions.join(", ")}</span>
                  </div>
                )}
                {run.networks.length > 0 && (
                  <div className="text-[11px] text-gray-500">
                    Networks: <span className="text-gray-700">{run.networks.join(", ")}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
};

CableRunsPanel.propTypes = {
  cables: PropTypes.array,
  onTrayLevelChange: PropTypes.func,
  machineAliases: PropTypes.objectOf(PropTypes.string),
  className: PropTypes.string
};

export default CableRunsPanel;
