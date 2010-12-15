About
====================
WebAL is a Javascript-based implementation of the OpenAL 3D audio API. Like WebGL, the idea is to provide a low-level interface to the audio
system allowing for more advanced frameworks to be built on top of it, as well as making ports of existing non-browser code easier.

[OpenAL](http://openal.org) is supported on almost all platforms and is designed for games and other high-performance applications. It supports
both simple 2D audio as well as full 3D, directional audio playback. The API is simple and familiar to anyone who has used an OpenGL-like system.

My dream for this project is that it demonstrates how useful a low-level audio API is in the browser now that hardware-accelerated 2D and 3D graphics
are becoming a reality. Instead of hacking OpenAL into a custom build of WebKit I figured delivering something that could run today in unmodified
browsers would be much more compelling. Long term, though, all of this should be directly inside the browser.

Features
---------------------
* Full software mixer (limits on sound playback scale linearly with the number of active sounds)
* 3D positional audio
* Streaming sources for low-level dynamic audio generation
* Support for `<audio>` sources (FF only)
* Flash fallback for browsers without direct audio writing
* HTML5 Audio fallback for browsers without Flash

Credits
---------------------
* Ben Vanik (ben.vanik@gmail.com)
* The software mixer comes from the [OpenAL Soft](http://kcat.strangesoft.net/openal.html) project

Why?
====================
I've been playing with building games in the browser for the past few months and although the rapidly-improving <canvas> implementations and
WebGL are making it really easy to display pretty things, the sound support inside the browser sucks. Only recently have people started working
on solutions to getting audio out from pages that don't involve plugins, but they are all focused around non-gaming scenarios (where timing,
scalability, and other factors don't matter). For the more advanced APIs coming out (such as [Web Audio](http://chromium.googlecode.com/svn/trunk/samples/audio/specification/specification.html))
they use large, cumbersome graphs that may work well for setting up static audio scenes but don't fit in to immediate-mode games.

Having had some experience with OpenAL on the iPhone, I decided to bring the API over to the browser. I primarily want it for sound effects although
it could be used for music as well. Because there is a non-trivial bit of overhead doing the processing in Javascript it's best used for short,
transient sounds.

My goal is to have a little library with a clean API that works on most browsers (including older ones using fallbacks) to use in games. My dream
would be to actually get the spec published like WebGL ^_^

Known Issues/TODO
====================
* Massive performance pass required (lots of extra loops/copies/etc)
* Reduce playback latency if possible (using the 'auto latency detection' sample from MDC)
* Need a query on buffers to see if they have been loaded
* Implement seeking/querying position on sources
* You must provide both ogg and mp3 sources for your content (may be possible to do ogg decoding in Flash, but that seems hard)
* The HTML5 Audio output device has some bugs, but mainly because of broken browsers

Browser Support
====================
Currently only Firefox 4 provides an API that allows for this project to work 100% natively in the browser. Other browsers are playing with much
more complex (and nasty) higher-level APIs that it may be possible to emulate this on top of, but I haven't looked into it yet. When not running
in Firefox 4, a small Flash app will be used to do the sound writing only, with all the rest remaining in pure Javascript.

When Flash is not supported (such as on iOS) HTML5 Audio will be used. This uses the browser to do the playback but has some limitations - for
example, you can position sounds in 3D but the output will be as if they were mixed in mono (volume only adjustment, no panning). The browsers
all have issues with some of the more stressful scenarios, such as rapidly playing back the same sound or seeking quickly. Finally, there is
a per-source Audio element created which if the browsers aren't reusing resources (I doubt they are) can quickly blow up memory and bring the
browser down.

Design
====================
* [OpenAL 1.1 Spec](http://connect.creativelabs.com/openal/Documentation/OpenAL%201.1%20Specification.htm)
* [OpenAL Programmers Guide](http://connect.creativelabs.com/openal/Documentation/OpenAL_Programmers_Guide.pdf)

The library is designed to be as close to the OpenAL 1.1 specification as possible. Where possible I borrowed from the WebGL spec to keep
the two APIs as consistent as possible (for example, with the naming of get*Parameter/etc calls and type collapsing).

Check out the `webal.idl` file to see what the API looks like.

**TODO**: more design notes

Getting Started
====================

Creating a Context
--------------------
There is a shared WebALContext per document. You can cache the context or make the call to retreive it as much as you want.
    var al = WebAL.getContext();

Optionally you can pass an object defining a set of attributes to request from the device implementation. Use `getContextAttributes()`
after creation to query the values actually used by the underlying implementation (which may differ from the ones you asked for).
    var attrs = {
        // Frequency for mixing output buffer, in units of Hz
        frequency: 44100,
        // Refresh interval for mixer, in units of Hz
        refreshInterval: 16,
        // Number of output channels (1 or 2)
        channels: 2
    };
    var al = WebAL.getContext(attrs);
Note that only the first call to `getContext` will use the attributes - after that they are ignored.

To get the best performance you can set several flags indicating whether or not you want support for certain features.
    var attrs = {
        // If you will only be providing URLs and not dynamically filling buffers, disable dynamic audio
        supportDynamicAudio: false,
        // If you will not be using any of the 3D audio features or panning, disable stereo mixing
        supportStereoMixing: false
    };
    var al = WebAL.getContext(attrs);

For testing purposes you can override the device used for playback in two ways - appending a URL parameter or setting a context attribute.
    // Runtime override
    http://localhost/sample.html?webal_device=DEVICE

    // Coded override
    var attrs = {
        device: "DEVICE"
    };
    var al = WebAL.getContext(attrs);

### Supported Devices
* `null`: no output or processing (don't query state, it may be wrong)
* `test`: full mixing but no output
* `browser`: HTML5 Audio - doesn't support dynamic audio or stereo mixing
* `flash`: Flash software output
* `native`: browser-native audio output (currently only supported on Firefox 4+)

sample01 - Playing a Sound
--------------------
There are two primary objects in the OpenAL world - buffers and sources. Buffers are just blobs of sound data and sources are the actual
emitters that create sound. You can attach one or more buffers to a source and the same buffer can be attached to multiple sources.

Let's say you want to just load a simple sound to play occasionally:
    // Create an audio reference
    // Note that to support all browsers we must provide both ogg and mp3 versions of the content
    var audioRef = [
        { type: "audio/mpeg", src: "myeffect.mp3" },
        { type: "audio/ogg", src: "myeffect.ogg" }
    ];

    // Create the buffer and bind the audio to it
    var buffer = al.createBuffer();
    al.bufferData(buffer, audioRef, false);

    // Create the audio source and associate the buffer with it
    var source = al.createSource();
    source.sourceBuffer(source, buffer);

    // ... at some point in the future ...

    // Play the sound
    al.sourcePlay(source);

sample02 - Generating Sound Pt. 1
--------------------
If you are generating your own sound in code (via one of the great JS audio libraries out there) you can easily play it:
    // Create the sound data somehow
    var data = new Float32Array(...);

    // TODO: generate data!
    // Setup buffer (with appropriate format for the source data and frequency)
    var buffer = al.createBuffer();
    al.bufferData(buffer, al.FORMAT_MONO_FLOAT32, data, 44100);

    // Create source and play!
    var source = al.createSource();
    al.sourceBuffer(source, buffer);
    al.sourcePlay(source);
You can provide your audio data in many formats, but try to always pass the data array in as a Typed Array for performance reasons.
Valid formats are FORMAT_MONO8, FORMAT_MONO16, FORMAT_MONO_FLOAT32, FORMAT_STEREO8, FORMAT_STEREO16, and FORMAT_STEREO_FLOAT32.

Note that this is considered a static buffer (of type al.STATIC). The assumption here is that you will not be changing its contents
much. If you do, behavior is undefined. This works great when you can generate all your data ahead of time (and it's relatively small),
but if you are trying to stream larger amounts of audio this method won't work.

sample03 - Generating Sound Pt. 2
--------------------
So say you want to actually stream long tracks - this could be dynamic music, synthesized effects, etc. Instead of creating several
megabytes of sample data (slow) and statically setting it (hanging onto that memory forever), you can use buffer queuing. The idea here
is that you'll have several smaller buffers that you'll queue on the audio source. As the source is playing those buffers will provide the
data required for playback. You can then, when one of the buffers is finished being used, pull that out and populate it with new data
before queuing it back up. This way no new buffers are being allocated, total memory usage is low, and you can have an infinite length
audio source.

There's a lot of code here - check out sample03 instead.

sample04 - Playing Multiple Sounds
--------------------
WebAL has a mixer built in - that means that you can play multiple sounds at the same time and they will all be mixed together. Doing this
is as simple as just calling `al.sourcePlay()` on your sources as you want them to start playing!

Check out the sample for a demonstration of this as well as some examples of querying source states/etc.

sample05 - Positioning Sounds
--------------------
There are several ways to affect how sounds are heard in WebAL. The two main areas that play a role are the listener and the source.

The listener is defined as having a position in 3D space that represents the destination for all sounds. You can set the gain (volume),
position, orientation, and velocity like such:
    // GAIN is a [0-1] range where 0 is muted and 1 is max
    al.listenerParameter(al.GAIN, 0.5);
    // POSITION is an XYZ position in scene space
    al.listenerParameter(al.POSITION, [10, 0, 3]);
    // VELOCITY is a vector representing the speed and direction of the listener (or zeros to ignore)
    al.listenerParameter(al.VELOCITY, [4, 0, 0]);
    // ORIENTATION is a packed array with XYZ of the forward vector followed by the XYZ of the up vector
    al.listenerParameter(al.ORIENTATION, [
        0, 0, -1, // Forward
        0, 1, 0   // Up
    ]);

Sound sources also have a variety of parameters that allow you to affect how the listener hears them:
    // GAIN is a [0-1] range where 0 is muted and 1 is max
    al.sourceParameter(source, al.GAIN, 0.5);
    // PITCH is a pitch multiplier
    al.sourceParameter(source, al.PITCH, 1.0);
    // SOURCE_RELATIVE indicates that the POSITION of this source is relative to the position of the listener (instead of in scene space)
    al.sourceParameter(source, al.SOURCE_RELATIVE, false);
    // POSITION, VELOCITY, and DIRECTION - leave VELOCITY/DIRECTION as all zeros if you won't use them
    al.sourceParameter(source, al.POSITION, [0, 5, 0]);
    al.sourceParameter(source, al.VELOCITY, [0, 1, 0]);
    al.sourceParameter(source, al.DIRECTION, [0, 0, 0]);
    // There are many more, including min/max gain, distance model and arguments, etc

If you are using WebAL to play sounds without using positioning, you will likely only use GAIN to change the per-sound volume. In a
2D game you'd likely use POSITION on the listener or the source to modify the x and pan the sound between speakers. In a full 3D game
you can use the additional parameters to get true 3D sound.

*NOTE*: only mono sound sources will have positional affects. Stereo sources are only affected by GAIN.

Samples Coming Soon
--------------------
* Per-sound audio control (volume, etc)
* Positioning sounds in 2D and 3D

Notes
====================
* 3D positional audio only works on mono sources - all but gain is ignored on stereo sources
* For performance reasons use mono output (see 'Creating a Context' above) if your sound effects don't require stereo
* Long-playing audio, such as music, should use the browser native `<audio>` tag - the mixer is designed for sound effects!
* Streaming support for audio from `<audio>` elements is not yet implemented - the entire buffer must be loaded - you can still play the sound, it'll just be silent
* Creating buffers is expensive - do it at load time or very infrequently
* Creating sources is cheap, but try to cache them if possible
* The sound may not be loaded by the first play - put the `sourcePlay` call in a button handler to see it work
