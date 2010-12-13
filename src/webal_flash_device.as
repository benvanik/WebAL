// This device impl works by letting Flash determine when data should be sampled and
// then calling out to Javascript to process it. I'm not sure if this is the best way to do it because
// of the cost of transitions, but it's a v0 :)

// Relevant docs:
// http://help.adobe.com/en_US/as3/dev/WSE523B839-C626-4983-B9C0-07CF1A087ED7.html
// http://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/flash/media/Sound.html
// http://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/flash/events/SampleDataEvent.html


package {
    import flash.display.Sprite;
    import flash.external.ExternalInterface;
    import flash.events.Event;
    import flash.net.URLRequest;
    import flash.utils.ByteArray;

    import flash.media.Sound;
    import flash.events.SampleDataEvent;

    public class webal_flash_device extends Sprite {
        private var sound : Sound;
        
        public function webal_flash_device () {
            ExternalInterface.addCallback("getAllAudioSamples", getAllAudioSamples);

            this.sound = new Sound();
            this.sound.addEventListener(SampleDataEvent.SAMPLE_DATA, sampleQuery);
            this.sound.play();

            ExternalInterface.call("__webal_flash_device_ready");
        }

        private function sampleQuery (event : SampleDataEvent) : void {
            // Call out to the host to get the data
            var sampleString : String = ExternalInterface.call("__webal_flash_device_sampleQuery");
            if (sampleString) {
                // Convert back into numbers and write to sample data buffer
                for each (var sample : String in sampleString.split(" ")) {
                    event.data.writeFloat(Number(sample));
                }
            } else {
                // No data returned - no sounds playing? Fast path for silence
                for (var n : int = 0; n < 4096; n++) {
                    event.data.writeFloat(0.0);
                }
            }
        }

        public function getAllAudioSamples (bufferId : int, url : String) : void {
            var request : URLRequest = new URLRequest(url);
            var requestSound : Sound = new Sound();
            requestSound.addEventListener(Event.COMPLETE, function () : void {
                var sampleCount : int = Math.round(requestSound.length * 44100 / 1000);
                var buffer : ByteArray = new ByteArray();
                requestSound.extract(buffer, sampleCount);

                // Call back into javascript with the buffer bytes
                buffer.position = 0;
                var bufferString : String = "";
                for (var n : int = 0; n < sampleCount * 2; n++) {
                    bufferString += String(buffer.readFloat());
                    if (n != sampleCount * 2 - 1) {
                        bufferString += " ";
                    }
                }
                ExternalInterface.call("__webal_flash_device_completedAudioSamples", bufferId, sampleCount, bufferString);

                requestSound.removeEventListener(Event.COMPLETE, arguments.callee);
            });
            requestSound.load(request);
        };

        // TODO: streaming
    };
};
