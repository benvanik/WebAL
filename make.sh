# Build Flash fallback device
../flex_sdk/bin/mxmlc -use-network=false -o lib\\webal_flash_device.swf -file-specs src\\webal_flash_device.as

# Cat all files together
cd src

cat WebALCore.js > WebAL.cat.core.js
cat WebALContext.js WebALListener.js WebALBuffer.js WebALSource.js > WebAL.cat.types.js
cat WebALDevice.js WebALSoftwareMixer.js > WebAL.cat.device.js

cd devices
cat WebALNullDevice.js WebALTestDevice.js WebALFlashDevice.js WebALNativeDevice.js WebALBrowserDevice.js > ../WebAL.cat.devices.js
cd ..

cat WebAL.cat.core.js WebAL.cat.types.js WebAL.cat.device.js WebAL.cat.devices.js > ../lib/WebAL-debug.js
rm WebAL.cat.core.js WebAL.cat.types.js WebAL.cat.device.js WebAL.cat.devices.js

cd ..

