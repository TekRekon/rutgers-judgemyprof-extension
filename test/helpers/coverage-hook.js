import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";


const thresholds = Object.freeze({lines: 98, statements: 98, functions: 97, branches: 90});
globalThis.__coverage__ = {};

process.on("exit", () => {
    const coverageMap = libCoverage.createCoverageMap(globalThis.__coverage__);
    const reportContext = libReport.createContext({coverageMap});
    reports.create("text", {maxCols: 240}).execute(reportContext);

    const summary = coverageMap.getCoverageSummary().toJSON();
    for (const [metric, minimum] of Object.entries(thresholds)) {
        const actual = summary[metric].pct;
        if (actual < minimum) {
            process.stderr.write(`Coverage for ${metric} (${actual}%) is below ${minimum}%.\n`);
            process.exitCode = 1;
        }
    }
});
