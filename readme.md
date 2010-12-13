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
* Support for <audio> sources (FF only)
* Flash fallback for browsers without direct audio writing

Credits
---------------------
* Ben Vanik (ben.vanik@gmail.com)
* The software mixer comes from the [OpenAL Soft](http://kcat.strangesoft.net/openal.html) project

Why?
====================
I've been playing with building games in the browser for the past few months and although the rapidly-improving <canvas> implementations and
WebGL are making it really easy to display pretty things, the sound support inside the browser sucks. Only recently have people started working
on solutions to getting audio out from pages that don't involve plugins, but they are all focused around non-gaming scenarios (where timing,
scalability, and other factors don't matter). For the more advanced APIs coming out (such as Web Audio) they use large, cumbersome graphs that
may work well for setting up static audio scenes but don't fit in to immediate-mode games.

Having had some experience with OpenAL on the iPhone, I decided to bring the API over to the browser. I primarily want it for sound effects although
it could be used for music as well. Because there is a non-trivial bit of overhead doing the processing in Javascript it's best used for short,
transient sounds.

My goal is to have a little library with a clean API that works on most browsers (including older ones using fallbacks) to use in games. My dream
would be to actually get the spec published like WebGL ^_^

Known Issues/TODO
====================
* All 2D/3D options are untested (need samples)
* sample03 (buffer queueing) doesn't work right
* Massive performance pass required (lots of extra loops/copies/etc)
* Need fallback support for browsers missing Typed Array support
* Need Flash fallback widget for non-Firefox browsers
* <audio> tag read support only works in Firefox
* Implement a device that targets [Web Audio](http://chromium.googlecode.com/svn/trunk/samples/audio/specification/specification.html)
* Reduce playback latency if possible (using the 'auto latency detection' sample from MDC)

Browser Support
====================
Currently only Firefox 4 provides an API that allows for this project to work 100% natively in the browser. Other browsers are playing with much
more complex (and nasty) higher-level APIs that it may be possible to emulate this on top of, but I haven't looked into it yet. When not running
in Firefox 4, a small Flash app will be used to do the sound writing only, with all the rest remaining in pure Javascript.

Design
====================
* [OpenAL 1.1 Spec](http://connect.creativelabs.com/openal/Documentation/OpenAL%201.1%20Specification.htm)
* [OpenAL Programmers Guide](http://connect.creativelabs.com/openal/Documentation/OpenAL_Programmers_Guide.pdf)

The library is designed to be as close to the OpenAL 1.1 specification as possible. Where possible I borrowed from the WebGL spec to keep
the two APIs as consistent as possible (for example, with the naming of get*Parameter/etc calls and type collapsing).

**TODO**: more design notes

Getting Started
====================

Creating a Context
--------------------
There is a shared WebALContext per document. You can cache the context or make the call to retreive it as much as you want.
    var al = WebAL.getContext();

Optionally you can pass an object defining a set of attributes to request from the device implementation.
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

Playing a Sound (sample01)
--------------------
There are two primary objects in the OpenAL world - buffers and sources. Buffers are just blobs of sound data and sources are the actual
emitters that create sound. You can attach one or more buffers to a source and the same buffer can be attached to multiple sources.

Let's say you want to just load a simple sound to play occasionally:
    // Create a browser <audio> element to get ogg decoding for free
    var audioEl = new Audio();
    audioEl.src = "myeffect.ogg";
    // Create the buffer and bind the <audio> element to it
    var buffer = al.createBuffer();
    al.bufferData(buffer, audioEl);
    // Create the audio source and associate the buffer with it
    var source = al.createSource();
    source.sourceBuffer(source, buffer);
    // ... at some point in the future ...
    // Play the sound
    al.sourcePlay(source);
Some things to note about this sample are:
* Creating buffers is expensive - do it at load time or very infrequently
* Creating sources is cheap, but try to cache them if possible
* The sound may not be loaded by the first play - put the `sourcePlay` call in a button handler to see it work

Generating Sound Pt. 1 (sample02)
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

Generating Sound Pt. 2 (sample03)
--------------------
So say you want to actually stream long tracks - this could be dynamic music, synthesized effects, etc. Instead of creating several
megabytes of sample data (slow) and statically setting it (hanging onto that memory forever), you can use buffer queuing. The idea here
is that you'll have several smaller buffers that you'll queue on the audio source. As the source is playing those buffers will provide the
data required for playback. You can then, when one of the buffers is finished being used, pull that out and populate it with new data
before queuing it back up. This way no new buffers are being allocated, total memory usage is low, and you can have an infinite length
audio source.

There's a lot of code here - check out sample03 instead.

Playing Multiple Sounds (sample04)
--------------------
WebAL has a mixer built in - that means that you can play multiple sounds at the same time and they will all be mixed together. Doing this
is as simple as just calling `al.sourcePlay()` on your sources as you want them to start playing!

check out the sample for a demonstration of this as well as some examples of querying source states/etc.

Samples Coming Soon
--------------------
* Per-sound audio control (volume, etc)
* Positioning sounds in 2D and 3D

Notes
====================
* 3D positional audio only works on mono sources - all but gain is ignored on stereo sources
* For performance reasons use mono output (see 'Creating a Context' above) if your sound effects don't require stereo
* Long-playing audio, such as music, should use the browser native <audio> tag - the mixer is designed for sound effects!
* Streaming support for audio from <audio> elements is not yet implemented - the entire buffer must be loaded - you can still play the sound, it'll just be silent

