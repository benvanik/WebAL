(function () {
    var exports = window;

    var MAXCHANNELS = 3; // L R C
    var FRONT_LEFT = 0;
    var FRONT_RIGHT = 1;
    var FRONT_CENTER = 2;
    var STACK_DATA_SIZE = 16384;
    var FRACTIONBITS = 14;
    var FRACTIONONE = (1 << FRACTIONBITS);
    var FRACTIONMASK = (FRACTIONONE - 1);
    var POINT_RESAMPLER = 0;
    var LINEAR_RESAMPLER = 1;
    var CUBIC_RESAMPLER = 2;
    var RESAMPLERPADDING = [0 /*point*/, 1 /*linear*/, 2 /*cubic*/];
    var RESAMPLERPREPADDING = [0 /*point*/, 0 /*linear*/, 1 /*cubic*/];

    var BUFFERSIZE = 4096;

    var WebALSoftwareMixer = function (context, device) {
        this.context = context;

        this.channels = device.channels;
        this.dryBuffer = new Array(MAXCHANNELS);
        for (var n = 0; n < MAXCHANNELS; n++) {
            this.dryBuffer[n] = new WebALFloatArray(BUFFERSIZE * this.channels);
        }

        this.scratchBuffer = new WebALFloatArray(STACK_DATA_SIZE / 4);

        this.channelMatrix = new Array(MAXCHANNELS);
        for (var n = 0; n < MAXCHANNELS; n++) {
            this.channelMatrix[n] = new WebALFloatArray(MAXCHANNELS);
        }

        var deviceChannels = device.channels;
        switch (deviceChannels) {
            case 1:
                this.channelMatrix[FRONT_CENTER][FRONT_CENTER] = 1.0;
                this.channelMatrix[FRONT_LEFT][FRONT_CENTER] = Math.sqrt(0.5);
                this.channelMatrix[FRONT_RIGHT][FRONT_CENTER] = Math.sqrt(0.5);
                break;
            case 2:
                this.channelMatrix[FRONT_LEFT][FRONT_LEFT] = 1.0;
                this.channelMatrix[FRONT_RIGHT][FRONT_RIGHT] = 1.0;
                this.channelMatrix[FRONT_CENTER][FRONT_LEFT] = Math.sqrt(0.5);
                this.channelMatrix[FRONT_CENTER][FRONT_RIGHT] = Math.sqrt(0.5);
                break;
        }
    };

    WebALSoftwareMixer.prototype.write = function (target, sampleCount) {
        var al = this.context;

        // Clear the mixing buffer
        for (var n = 0; n < MAXCHANNELS; n++) {
            for (var m = 0; m < sampleCount * this.channels; m++) {
                this.dryBuffer[n][m] = 0.0;
            }
        }

        // Mix in all samples
        for (var n = 0; n < al.activeSources.length; n++) {
            var source = al.activeSources[n];
            if (source.buffer.data.length == 0) {
                // Skip empty sources
                continue;
            }
            this.mixSource(source, sampleCount);
        }

        // Write to target
        var dryBuffer = this.dryBuffer;
        var targetOffset = 0;
        if (this.channels == 1) {
            // Mono
            for (var n = 0; n < sampleCount; n++) {
                var samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n] * this.channelMatrix[c][FRONT_CENTER];
                }
                target[targetOffset++] = samp;
            }
        } else if (this.channels == 2) {
            // Stereo
            for (var n = 0; n < sampleCount; n++) {
                var samp;
                samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n] * this.channelMatrix[c][FRONT_LEFT];
                }
                target[targetOffset++] = samp;
                samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n] * this.channelMatrix[c][FRONT_RIGHT];
                }
                target[targetOffset++] = samp;
            }
        }
    };

    WebALSoftwareMixer.prototype.fillBuffer = function (target, sampleCapacity) {
        var al = this.context;

        // Scan for any active sources - if none (or none that have any data), abort
        var anyActiveSources = false;
        for (var n = 0; n < al.activeSources.length; n++) {
            var source = al.activeSources[n];
            if (source.buffer.data.length == 0) {
                // Skip empty sources
                continue;
            }
            anyActiveSources = true;
        }
        if (!anyActiveSources) {
            return false;
        }

        var samplesRemaining = sampleCapacity;
        while (samplesRemaining > 0) {
            var sampleCount = Math.min(samplesRemaining, BUFFERSIZE);

            this.write(target, sampleCount);

            samplesRemaining -= sampleCount;
        }

        return true;
    };

    function lerp(val1, val2, mu) {
        return val1 + (val2 - val1) * mu;
    };
    function cubic(val0, val1, val2, val3, mu) {
        var mu2 = mu * mu;
        var a0 = -0.5 * val0 + 1.5 * val1 + -1.5 * val2 + 0.5 * val3;
        var a1 = val0 + -2.5 * val1 + 2.0 * val2 + -0.5 * val3;
        var a2 = -0.5 * val0 + 0.5 * val2;
        var a3 = val1;
        return a0 * mu * mu2 + a1 * mu2 + a2 * mu + a3;
    };

    function sample_point32(data, dataByteOffset, step, frac) {
        return data[dataByteOffset / 4];
    };
    function sample_lerp32(data, dataByteOffset, step, frac) {
        return lerp(data[dataByteOffset / 4], data[dataByteOffset / 4 + step], frac * (1.0 / FRACTIONONE));
    };
    function sample_cubic32(data, dataByteOffset, step, frac) {
        var v0 = data[dataByteOffset / 4 - step];
        var v1 = data[dataByteOffset / 4];
        var v2 = data[dataByteOffset / 4 + step];
        var v3 = data[dataByteOffset / 4 + step + step];
        return cubic(v0, v1, v2, v3, frac * (1.0 / FRACTIONONE));
    };

    function lpFilter4PC(iir, offset, input) {
        var history = iir.history;
        var a = iir.coeff;
        var output = input;
        output = output + (history[offset + 0] - output) * a;
        output = output + (history[offset + 1] - output) * a;
        output = output + (history[offset + 2] - output) * a;
        output = output + (history[offset + 3] - output) * a;
        return output;
    }

    function mix_1(mixer, source, data, dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sampler) {
        var dryBuffer = mixer.dryBuffer;
        var increment = source.params.step;

        var scalar = 1 / mixer.channels;

        var pos = 0;
        var frac = dataPosFrac;

        var dryFilter = source.params.iirFilter;
        var drySend = new Array(MAXCHANNELS);
        for (var c = 0; c < MAXCHANNELS; c++) {
            drySend[c] = source.params.dryGains[0][c];
        }

        for (var n = 0; n < bufferSize; n++) {
            // First order interpolator
            var value = sampler(data, pos * 4, 1, frac);

            // Direct path final mix buffer and panning
            value = lpFilter4PC(dryFilter, 0, value);
            for (var c = 0; c < MAXCHANNELS; c++) {
                dryBuffer[c][outPos] += value * drySend[c] * scalar;
            }

            frac += increment;
            pos += frac >> FRACTIONBITS;
            frac &= FRACTIONMASK;
            outPos++;
        }

        return [dataPosInt + pos, frac];
    };
    function mix_2(mixer, source, data, dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sampler) {
        var dryBuffer = mixer.dryBuffer;
        var increment = source.params.step;

        var pos = 0;
        var frac = dataPosFrac;

        var dryFilter = source.params.iirFilter;
        var drySend = new Array(2);
        drySend[0] = new Array(MAXCHANNELS);
        drySend[1] = new Array(MAXCHANNELS);
        for (var n = 0; n < 2; n++) {
            for (var c = 0; c < MAXCHANNELS; c++) {
                drySend[n][c] = source.params.dryGains[n][c];
            }
        }

        for (var n = 0; n < bufferSize; n++) {
            for (var m = 0; m < 2; m++) {
                // First order interpolator
                var value = sampler(data, pos * 2 * 4 + m * 4, 2, frac);

                // Direct path final mix buffer and panning
                value = lpFilter4PC(dryFilter, m * 2, value);
                for (var c = 0; c < MAXCHANNELS; c++) {
                    dryBuffer[c][outPos] += value * drySend[m][c];
                }
            }

            frac += increment;
            pos += frac >> FRACTIONBITS;
            frac &= FRACTIONMASK;
            outPos++;
        }

        return [dataPosInt + pos, frac];
    };

    WebALSoftwareMixer.prototype.mixSource = function (source, sampleCount) {
        var al = this.context;

        // Source info
        var state = source.state;
        var buffersProcessed = source.buffersProcessed;
        var dataPosInt = source.dataPosition;
        var dataPosFrac = source.dataPositionFrac;
        var increment = source.params.step;
        var resampler = (increment == FRACTIONONE) ? POINT_RESAMPLER : source.resampler;

        // Buffer info
        var buffer = source.queue[0];
        var bufferChannels = buffer.channels;
        var bufferType = buffer.type;
        var frameSize = bufferChannels * bufferType;

        // Get the current buffer
        if (source.buffersProcessed < source.buffersQueued) {
            buffer = source.queue[source.buffersProcessed];
        } else {
            buffer = source.queue[0];
        }

        // TODO: find a way to eliminate the need for the scratch buffer
        // It's used to hold data from the source before resampling into the target
        var scratch = this.scratchBuffer;
        function clearScratch(destByteOffset, byteLength) {
            for (var n = destByteOffset / 4; n < destByteOffset / 4 + byteLength / 4; n++) {
                scratch[n] = 0;
            }
        };
        function writeScratch(destByteOffset, source, sourceByteOffset, byteLength) {
            var dx = destByteOffset / 4;
            var sx = sourceByteOffset / 4;
            for (var n = 0; n < byteLength / 4; n++, dx++, sx++) {
                scratch[dx] = source[sx];
            }
        };

        var outPos = 0;
        do {
            var bufferPrePadding = RESAMPLERPREPADDING[resampler];
            var bufferPadding = RESAMPLERPADDING[resampler];

            // Figure out how many buffer bytes will be needed
            var dataSize = sampleCount - outPos + 1;
            dataSize *= increment;
            dataSize += dataPosFrac + FRACTIONMASK;
            dataSize >>= FRACTIONBITS;
            dataSize += bufferPadding + bufferPrePadding;
            dataSize *= frameSize;

            var bufferSize = Math.min(dataSize, STACK_DATA_SIZE);
            bufferSize -= bufferSize % frameSize;

            var sourceDataOffset = 0;
            var sourceDataSize = 0;
            if (source.type == al.STATIC) {
                buffer = source.buffer;

                if (!source.looping || (dataPosInt >= buffer.loopEnd)) {
                    // Not looping

                    var pos = 0;
                    if (dataPosInt >= bufferPrePadding) {
                        pos = (dataPosInt - bufferPrePadding) * frameSize;
                    } else {
                        var dataSize1 = (bufferPrePadding - dataPosInt) * frameSize;
                        dataSize1 = Math.min(bufferSize, dataSize1);

                        clearScratch(sourceDataOffset + sourceDataSize, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;

                        pos = 0;
                    }

                    // Copy what's left to play in the source buffer and clear the rest of the temp buffer
                    var dataSize1 = buffer.data.byteLength - pos;
                    dataSize1 = Math.min(bufferSize, dataSize1);

                    writeScratch(sourceDataOffset + sourceDataSize, buffer.data, pos, dataSize1);
                    sourceDataSize += dataSize1;
                    bufferSize -= dataSize1;

                    clearScratch(sourceDataOffset + sourceDataSize, bufferSize);
                    sourceDataSize += bufferSize;
                    bufferSize -= bufferSize;
                } else {
                    // Looping
                    var loopStart = buffer.loopStart;
                    var loopEnd = buffer.loopEnd;

                    var pos = 0;
                    if (dataPosInt >= loopStart) {
                        pos = dataPosInt - loopStart;
                        while (pos < bufferPrePadding) {
                            pos += loopEnd - loopStart;
                        }
                        pos -= bufferPrePadding;
                        pos += loopStart;
                        pos *= frameSize;
                    } else if (dataPosInt >= bufferPrePadding) {
                        pos = (dataPosInt - bufferPrePadding) * frameSize;
                    } else {
                        var dataSize1 = (bufferPrePadding - dataPosInt) * frameSize;
                        dataSize1 = Math.min(bufferSize, dataSize1);

                        clearScratch(sourceDataOffset + sourceDataSize, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;

                        pos = 0;
                    }

                    // Copy what's left of this loop iteration then copy repeats of the loop section
                    var dataSize1 = loopEnd * frameSize - pos;
                    dataSize1 = Math.min(bufferSize, dataSize1);

                    writeScratch(sourceDataOffset + sourceDataSize, buffer.data, pos, dataSize1);
                    sourceDataSize += dataSize1;
                    bufferSize -= dataSize1;

                    var dataSize1 = (loopEnd - loopStart) * frameSize;
                    while (bufferSize > 0) {
                        dataSize1 = Math.min(bufferSize, dataSize1);

                        writeScratch(sourceDataOffset + sourceDataSize, buffer.data, loopStart + frameSize, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;
                    }
                }
            } else {
                // Crawl the buffer queue to fill in the temp buffer
                var queueIndex = source.queue.indexOf(buffer);

                var pos = 0;
                if (dataPosInt >= bufferPrePadding) {
                    pos = (dataPosInt - bufferPrePadding) * frameSize;
                } else {
                    pos = (bufferPrePadding - dataPosInt) * frameSize;
                    while (pos > 0) {
                        if ((queueIndex == 0) && !source.looping) {
                            var dataSize1 = Math.min(bufferSize, pos);

                            clearScratch(sourceDataOffset + sourceDataSize, dataSize1);
                            sourceDataSize += dataSize1;
                            bufferSize -= dataSize1;

                            pos = 0;
                            break;
                        }

                        if (source.looping) {
                            queueIndex = source.queue.length - 1;
                        } else {
                            queueIndex--;
                        }

                        var bufferItr = source.queue[queueIndex];
                        if (bufferItr.data.byteLength > pos) {
                            pos = bufferItr.data.byteLength - pos;
                            break;
                        }
                        pos -= bufferItr.data.byteLength;
                    }
                }

                while ((queueIndex >= 0) && (queueIndex < source.queue.length) && (bufferSize > 0)) {
                    var bufferItr = source.queue[queueIndex];
                    var dataSize1 = bufferItr.data.byteLength;

                    // Skip the data already played
                    if (dataSize1 <= pos) {
                        pos -= dataSize1;
                    } else {
                        var dataOffset = pos;
                        dataSize1 -= pos;
                        pos -= pos;

                        dataSize1 = Math.min(bufferSize, dataSize1);
                        writeScratch(sourceDataOffset + sourceDataSize, buffer.data, dataOffset, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;
                    }

                    queueIndex++;
                    var atEnd = (queueIndex >= source.queue.length);
                    if (atEnd && source.looping) {
                        queueIndex = 0;
                    } else if (atEnd) {
                        clearScratch(sourceDataOffset + sourceDataSize, bufferSize);
                        sourceDataSize += bufferSize;
                        bufferSize -= bufferSize;
                    }
                }
            }

            // Figure out how many samples we can mix
            dataSize = sourceDataSize / frameSize;
            dataSize -= bufferPadding + bufferPrePadding;
            dataSize <<= FRACTIONBITS;
            dataSize -= increment;
            dataSize -= dataPosFrac;

            bufferSize = Math.floor((dataSize + (increment - 1)) / increment);
            bufferSize = Math.min(bufferSize, (sampleCount - outPos));

            sourceDataOffset += bufferPrePadding * frameSize;
            switch (resampler) {
                case POINT_RESAMPLER:
                    switch (bufferChannels) {
                        case 1:
                            var r = mix_1(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_point32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                        case 2:
                            var r = mix_2(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_point32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                    }
                    break;
                case LINEAR_RESAMPLER:
                    switch (bufferChannels) {
                        case 1:
                            var r = mix_1(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_lerp32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                        case 2:
                            var r = mix_2(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_lerp32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                    }
                    break;
                case CUBIC_RESAMPLER:
                    switch (bufferChannels) {
                        case 1:
                            var r = mix_1(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_cubic32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                        case 2:
                            var r = mix_2(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_cubic32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                    }
                    break;
                default:
                    break;
            }
            outPos += bufferSize;

            // Handle buffer queue and looping (if at end of queue)
            while (true) {
                var loopStart = buffer.loopStart;
                var loopEnd = buffer.loopEnd;
                var dataSize = buffer.data.byteLength / frameSize;
                if (dataSize > dataPosInt) {
                    // Still inside current buffer
                    break;
                }

                var queueIndex = source.queue.indexOf(buffer);
                if (queueIndex < source.queue.length - 1) {
                    // Move to next buffer
                    buffer = source.queue[queueIndex + 1];
                    buffersProcessed++;
                } else if (source.looping) {
                    // Loop
                    buffer = source.queue[0];
                    buffersProcessed = 0;
                    if (buffer.type == al.STATIC) {
                        dataPosInt = ((dataPosInt - loopStart) % (loopEnd - loopStart)) + loopStart;
                        break;
                    }
                } else {
                    // Finished
                    state = al.STOPPED;
                    buffer = source.queue[0];
                    buffersProcessed = source.buffersQueued;
                    dataPosInt = 0;
                    dataPosFrac = 0;
                    break;
                }

                dataPosInt -= dataSize;
            }

        } while ((state == al.PLAYING) && (outPos < sampleCount));

        // Update source info
        source.state = state;
        source.buffersProcessed = buffersProcessed;
        source.dataPosition = dataPosInt;
        source.dataPositionFrac = dataPosFrac;
        source.buffer = buffer;
    };

    exports.WebALSoftwareMixer = WebALSoftwareMixer;

})();
