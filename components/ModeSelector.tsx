import React from 'react';
import { AnalysisMode, MODE_LABELS, MODE_DESCRIPTIONS } from '../lib/types';

interface ModeSelectorProps {
  selectedMode: AnalysisMode;
  onSelectMode: (mode: AnalysisMode) => void;
}

export default function ModeSelector({ selectedMode, onSelectMode }: ModeSelectorProps) {
  const modes: AnalysisMode[] = ['quick', 'deep'];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        审视模式
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {modes.map((mode) => {
          const isSelected = selectedMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelectMode(mode)}
              className={`interactive-lift p-2.5 text-left rounded-lg border transition-all duration-200 focus:outline-none ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-sm shadow-indigo-500/10'
                  : 'border-gray-200 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-900 bg-white dark:bg-gray-900 hover:shadow-md hover:shadow-indigo-500/5'
              }`}
            >
              <div className="font-semibold text-sm text-gray-900 dark:text-white">
                {MODE_LABELS[mode]}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                {MODE_DESCRIPTIONS[mode]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
