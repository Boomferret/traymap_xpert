/**
 * Calculate dynamic grid resolution based on the longest side
 * Formula: round down to nearest multiple of 5, then divide by 100
 * Example: 26m -> 25m -> 0.25m resolution
 */
export const calculateDynamicResolution = (width, height) => {
  const longestSide = Math.max(width, height);
  const roundedDown = Math.floor(longestSide / 5) * 5;
  return roundedDown / 100;
};

/**
 * Convert real-world meters to grid units based on resolution
 */
export const metersToGridUnits = (meters, resolution) => {
  return Math.round(meters / resolution);
};

/**
 * Convert grid units to real-world meters based on resolution
 */
export const gridUnitsToMeters = (gridUnits, resolution) => {
  return gridUnits * resolution;
};

/**
 * Calculate the interval for showing measurement labels
 * Ensures reasonable spacing regardless of resolution
 */
export const calculateMeasurementInterval = (resolution) => {
  // Target approximately 1 meter intervals, but adjust for resolution
  if (resolution <= 0.05) return Math.round(1 / resolution); // 20 cells for 0.05m, 10 cells for 0.1m
  if (resolution <= 0.1) return Math.round(1 / resolution);  // 10 cells for 0.1m
  if (resolution <= 0.25) return Math.round(1 / resolution); // 4 cells for 0.25m
  if (resolution <= 0.5) return Math.round(2 / resolution);  // 4 cells for 0.5m (2m intervals)
  return Math.round(5 / resolution);  // For very large resolutions, use 5m intervals
};

/**
 * Get the measurement label for a given grid position
 */
export const getMeasurementLabel = (gridPosition, resolution, interval) => {
  if (gridPosition % interval !== 0) return null;
  const meters = gridUnitsToMeters(gridPosition, resolution);
  return `${meters.toFixed(meters < 1 ? 1 : 0)}m`;
}; 