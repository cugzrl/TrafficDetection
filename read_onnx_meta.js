const fs = require('fs');
const buffer = fs.readFileSync('public/detection_dair.onnx');
const str = buffer.toString('utf8');

// The classes are usually stored as a JSON string in ONNX metadata, e.g., '{"0": "car", "1": "truck", ...}'
// Or just as a list of names. Let's look for common class names.
const match = str.match(/\{"0":[^}]+\}/g);
if (match) {
    console.log("Found JSON mapping:", match);
} else {
    // Try to find names array
    const match2 = str.match(/names[^a-zA-Z0-9]+\[([^\]]+)\]/);
    if (match2) {
        console.log("Found names array:", match2[0]);
    } else {
        console.log("Could not find obvious class names metadata.");
        // print out some parts that look like json
        const jsonLike = str.match(/\{[^{}]+\}/g);
        if (jsonLike) {
            console.log("Some JSON-like strings:", jsonLike.filter(s => s.includes('0') && s.includes('1')).slice(0, 5));
        }
    }
}
