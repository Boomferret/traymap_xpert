export const parseCSV = (csvContent) => {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(';').map(v => v.replace(/"/g, '').trim());
      const entry = {};
      
      headers.forEach((header, index) => {
        if (values[index]) {
          entry[header] = values[index];
        }
      });
  
      return entry;
    }).filter(entry => entry['Cable Label']); // Filter out empty rows
  };
  
  export const extractMachines = (cables) => {
    const machines = new Map();
  
    cables.forEach(cable => {
      if (cable['Source (+)']) {
        machines.set(cable['Source (+)'], {
          name: cable['Source (+)'],
          description: cable['Source Mounting Location']
        });
      }
      if (cable['Target (+)']) {
        machines.set(cable['Target (+)'], {
          name: cable['Target (+)'],
          description: cable['Target Mounting Location']
        });
      }
    });
  
    return Array.from(machines.values());
  };
  
  export const extractCableFunctions = (cables) => {
    const functions = new Set();
    cables.forEach(cable => {
      if (cable['Cable Function']) {
        functions.add(cable['Cable Function']);
      }
    });
    return Array.from(functions);
  };