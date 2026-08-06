import {createInstrumenter} from "istanbul-lib-instrument";


const coverageEnabled = process.env.COVERAGE === "1";
const instrumenter = coverageEnabled
    ? createInstrumenter({compact: false, coverageVariable: "__coverage__"})
    : null;


export function instrumentSource(source, filename) {
    return instrumenter ? instrumenter.instrumentSync(source, filename) : source;
}
