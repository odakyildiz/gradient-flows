// Particle animation reused from the workshop homepage.
(function () {
        var canvas = document.getElementById('measure-canvas');
        if (!canvas || !canvas.getContext) return;

        var context = canvas.getContext('2d');
        var particles = [];
        var shapeTargets = new Float32Array(0);
        var colours = [
          [119, 151, 255],
          [105, 228, 220],
          [185, 247, 194],
          [198, 168, 255],
          [255, 146, 109]
        ];
        var sourceColour = [157, 176, 255];
        var particleStyles = new Array(colours.length);
        var tailStyles = [
          new Array(colours.length),
          new Array(colours.length),
          new Array(colours.length)
        ];
        var width = 0;
        var height = 0;
        var centreX = 0;
        var centreY = 0;
        var scaleX = 0;
        var scaleY = 0;
        var pixelRatio = 1;
        var segmentElapsed = 0;
        var shapeIndex = -1;
        var lastPaint = null;
        var animationFrame = 0;
        var resizeFrame = 0;
        var hasPainted = false;
        var isInViewport = true;
        var isPageVisible = document.visibilityState !== 'hidden';
        var duration = 1000;
        var holdDuration = 3000;
        var shapeCount = 5;
        var shapeSpins = [1, -1, 1, -1, 1];
        var frameInterval = 32;
        var loopStylesReady = false;
        var isHolding = false;
        var mobileViewport = window.matchMedia('(max-width: 700px)');
        var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
        var reducedMotion = motionPreference.matches;

        function clamp(value, lower, upper) {
          return Math.max(lower, Math.min(upper, value));
        }

        function seededRandom(seed) {
          return function () {
            seed += 0x6d2b79f5;
            var value = seed;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
          };
        }

        function normal(random) {
          var first = Math.max(random(), 0.0001);
          var second = random();
          return Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
        }

        function ease(value) {
          return value * value * (3 - 2 * value);
        }

        function easeOutBack(value) {
          var shifted = value - 1;
          return 1 + 1.9 * shifted * shifted * shifted + 0.9 * shifted * shifted;
        }

        function updateFillStyles(progress, tailFade) {
          for (var arm = 0; arm < colours.length; arm += 1) {
            var target = colours[arm];
            var red = Math.round(sourceColour[0] + (target[0] - sourceColour[0]) * progress);
            var green = Math.round(sourceColour[1] + (target[1] - sourceColour[1]) * progress);
            var blue = Math.round(sourceColour[2] + (target[2] - sourceColour[2]) * progress);
            particleStyles[arm] = 'rgba(' + red + ', ' + green + ', ' + blue + ', 0.94)';
            for (var tail = 0; tail < tailStyles.length; tail += 1) {
              var opacity = (0.24 + (tailStyles.length - 1 - tail) * 0.27) * tailFade;
              tailStyles[tail][arm] = 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + opacity.toFixed(3) + ')';
            }
          }
        }

        function targetOffset(shape, index) {
          return (shape * particles.length + index) * 2;
        }

        function writeTarget(shape, index, x, y) {
          var offset = targetOffset(shape, index);
          shapeTargets[offset] = x;
          shapeTargets[offset + 1] = y;
        }

        function writePolarTarget(shape, index, radius, angle, transverse) {
          writeTarget(
            shape,
            index,
            radius * Math.cos(angle) - transverse * Math.sin(angle),
            radius * Math.sin(angle) + transverse * Math.cos(angle)
          );
        }

        function updateLoopFillStyles() {
          if (loopStylesReady) return;
          updateFillStyles(1, 1);
          loopStylesReady = true;
        }

        function buildParticles() {
          var random = seededRandom(20261123);
          var count = mobileViewport.matches ? 130 : 240;
          var ribbons = 3;
          var pointsPerArm = Math.ceil(count / colours.length);
          var pointsPerRibbon = Math.ceil(pointsPerArm / ribbons);
          particles = Array.from({ length: count }, function (_, index) {
            var arm = index % 5;
            var sourceX = clamp(normal(random) * 0.19, -0.63, 0.63);
            var sourceY = clamp(normal(random) * 0.19, -0.63, 0.63);
            var sequence = Math.floor(index / colours.length);
            var ribbon = sequence % ribbons;
            var row = Math.floor(sequence / ribbons);
            var position = pointsPerRibbon > 1 ? row / (pointsPerRibbon - 1) : 0.5;
            var armAngle = arm * (Math.PI * 2 / 5);
            var ribbonPhase = ribbon * (Math.PI * 2 / ribbons);
            var petal = Math.pow(Math.sin(Math.PI * position), 0.72);
            var latticeRadial = 0.105 + position * 0.8;
            var latticeAngle = armAngle + 0.12 + 1.88 * position - 0.32 * position * position;
            var latticeX = latticeRadial * Math.cos(latticeAngle);
            var latticeY = latticeRadial * Math.sin(latticeAngle);
            var normalX = -Math.sin(latticeAngle);
            var normalY = Math.cos(latticeAngle);
            var broadSpread = 0.13 * (0.82 - position * 0.35) * clamp(normal(random), -1.35, 1.35);
            var streamX = latticeX + normalX * broadSpread;
            var streamY = latticeY + normalY * broadSpread;
            var braidedPosition = clamp(position + 0.025 * Math.sin(position * Math.PI * 2 + ribbonPhase), 0, 1);
            var braidRadial = 0.105 + braidedPosition * 0.8;
            var braidAngle = armAngle + 0.12 + 1.88 * braidedPosition - 0.32 * braidedPosition * braidedPosition;
            var braidNormalX = -Math.sin(braidAngle);
            var braidNormalY = Math.cos(braidAngle);
            var braidSpread = 0.055 * Math.sin(position * Math.PI * 4 + ribbonPhase) + 0.008 * Math.cos(position * Math.PI * 4 + ribbonPhase);
            var braidX = braidRadial * Math.cos(braidAngle) + braidNormalX * braidSpread;
            var braidY = braidRadial * Math.sin(braidAngle) + braidNormalY * braidSpread;
            var radialBreath = 0.025 * petal * Math.cos(position * Math.PI * 4 + ribbonPhase);
            var lockSpread = petal * (0.078 * Math.sin(ribbonPhase) + 0.018 * Math.sin(position * Math.PI * 4 + ribbonPhase));
            var targetRadius = latticeRadial + radialBreath;
            var targetX = targetRadius * Math.cos(latticeAngle) + normalX * lockSpread;
            var targetY = targetRadius * Math.sin(latticeAngle) + normalY * lockSpread;

            return {
              arm: arm,
              armAngle: armAngle,
              ribbon: ribbon,
              position: position,
              sourceX: sourceX,
              sourceY: sourceY,
              streamX: streamX,
              streamY: streamY,
              braidX: braidX,
              braidY: braidY,
              targetX: targetX,
              targetY: targetY,
              flowBias: 0.88 + 0.12 * Math.sin(latticeAngle * 2 + ribbonPhase),
              size: 1.75 + random() * 0.9,
              tailed: (row + ribbon + arm) % 2 === 0,
              tailX: [],
              tailY: []
            };
          });

          buildTargetLayouts();
        }

        function buildTargetLayouts() {
          var targetRandom = seededRandom(20261126);
          shapeTargets = new Float32Array(shapeCount * particles.length * 2);

          for (var index = 0; index < particles.length; index += 1) {
            var particle = particles[index];
            var position = particle.position;
            var signedPosition = position * 2 - 1;
            var petal = Math.sin(Math.PI * position);
            var ribbonOffset = particle.ribbon - 1;
            var radialJitter = clamp(normal(targetRandom), -1.15, 1.15);
            var transverseJitter = clamp(normal(targetRandom), -1.15, 1.15);
            var armAngle = particle.armAngle;

            // The approved opening five-petal fold.
            writeTarget(0, index, particle.targetX, particle.targetY);

            // A five-sector iris with a quiet central aperture.
            writePolarTarget(
              1,
              index,
              0.58 + 0.12 * Math.cos(Math.PI * signedPosition) + 0.03 * ribbonOffset + 0.022 * radialJitter,
              armAngle + 0.56 * signedPosition + 0.1 * Math.sin(Math.PI * 2 * position),
              0.065 * (ribbonOffset + 0.6 * transverseJitter)
            );

            // Three broken orbital bands, with a small five-fold ripple.
            var orbitAngle = armAngle + 1.22 * signedPosition;
            writePolarTarget(
              2,
              index,
              0.32 + 0.23 * (ribbonOffset + 1) + 0.04 * Math.cos(5 * orbitAngle + 0.25) + 0.03 * radialJitter,
              orbitAngle,
              0.04 * transverseJitter
            );

            // Broad aperture petals rather than thin radial spokes.
            writePolarTarget(
              3,
              index,
              0.17 + 0.67 * position + 0.02 * radialJitter,
              armAngle + 0.31 * signedPosition * (0.35 + 0.65 * petal),
              0.17 * petal * (ribbonOffset + 0.45 * transverseJitter)
            );

            // A dense wheel of curved crescents.
            writePolarTarget(
              4,
              index,
              0.46 + 0.25 * position + 0.04 * radialJitter,
              armAngle + 0.98 * signedPosition + 0.25 * petal,
              0.085 * (ribbonOffset + 0.55 * transverseJitter)
            );

          }
        }

        function resetTails() {
          for (var index = 0; index < particles.length; index += 1) {
            particles[index].tailX.length = 0;
            particles[index].tailY.length = 0;
          }
        }

        function drawTails(tailFade) {
          if (tailFade <= 0) return;

          for (var tail = tailStyles.length - 1; tail >= 0; tail -= 1) {
            for (var arm = 0; arm < colours.length; arm += 1) {
              context.beginPath();
              var hasTail = false;
              for (var index = arm; index < particles.length; index += colours.length) {
                var particle = particles[index];
                var historyIndex = particle.tailX.length - 2 - tail;
                if (!particle.tailed || historyIndex < 0) continue;
                var radius = particle.size * (0.42 + (tailStyles.length - 1 - tail) * 0.2);
                context.moveTo(particle.tailX[historyIndex] + radius, particle.tailY[historyIndex]);
                context.arc(particle.tailX[historyIndex], particle.tailY[historyIndex], radius, 0, Math.PI * 2);
                hasTail = true;
              }
              if (!hasTail) continue;
              context.fillStyle = tailStyles[tail][arm];
              context.fill();
            }
          }
        }

        function drawParticles() {
          for (var arm = 0; arm < colours.length; arm += 1) {
            context.beginPath();
            for (var index = arm; index < particles.length; index += colours.length) {
              var particle = particles[index];
              context.moveTo(particle.renderX + particle.size, particle.renderY);
              context.arc(particle.renderX, particle.renderY, particle.size, 0, Math.PI * 2);
            }
            context.fillStyle = particleStyles[arm];
            context.fill();
          }
        }

        function recordTail(particle) {
          particle.tailX.push(particle.renderX);
          particle.tailY.push(particle.renderY);
          if (particle.tailX.length > 4) {
            particle.tailX.shift();
            particle.tailY.shift();
          }
        }

        function drawOpening(progress) {
          context.clearRect(0, 0, width, height);
          loopStylesReady = false;
          var streamStage = ease(clamp(progress / 0.38, 0, 1));
          var braidStage = ease(clamp((progress - 0.24) / 0.52, 0, 1));
          var lockInput = clamp((progress - 0.62) / 0.38, 0, 1);
          var lockStage = easeOutBack(lockInput);
          var flowPulse = Math.sin(Math.PI * progress);
          var tailFade = 1 - clamp((progress - 0.78) / 0.08, 0, 1);
          updateFillStyles(ease(clamp((progress - 0.08) / 0.52, 0, 1)), tailFade);

          for (var index = 0; index < particles.length; index += 1) {
            var particle = particles[index];
            var streamX = particle.sourceX + (particle.streamX - particle.sourceX) * streamStage;
            var streamY = particle.sourceY + (particle.streamY - particle.sourceY) * streamStage;
            var braidX = streamX + (particle.braidX - streamX) * braidStage;
            var braidY = streamY + (particle.braidY - streamY) * braidStage;
            var transportX = braidX + (particle.targetX - braidX) * lockStage;
            var transportY = braidY + (particle.targetY - braidY) * lockStage;
            var transportRadius = Math.sqrt(transportX * transportX + transportY * transportY);
            var fieldTurn = flowPulse * (0.13 + 0.33 * Math.min(transportRadius, 0.95)) * particle.flowBias;
            var fieldCos = Math.cos(fieldTurn);
            var fieldSin = Math.sin(fieldTurn);
            var particleX = transportX * fieldCos - transportY * fieldSin;
            var particleY = transportX * fieldSin + transportY * fieldCos;
            particle.renderX = centreX + particleX * scaleX;
            particle.renderY = centreY + particleY * scaleY;
            if (particle.tailed && !reducedMotion && progress > 0.1 && progress < 0.78) {
              recordTail(particle);
            }
          }

          drawTails(tailFade);
          drawParticles();
          hasPainted = true;
        }

        function drawMorph(progress, fromShape, toShape) {
          context.clearRect(0, 0, width, height);
          var transportStage = ease(progress);
          var flowPulse = Math.sin(Math.PI * progress);
          var spinDirection = shapeSpins[fromShape];
          var holding = progress >= 1;
          updateLoopFillStyles();

          for (var index = 0; index < particles.length; index += 1) {
            var particle = particles[index];
            var fromOffset = targetOffset(fromShape, index);
            var toOffset = targetOffset(toShape, index);
            var fromX = shapeTargets[fromOffset];
            var fromY = shapeTargets[fromOffset + 1];
            var deltaX = shapeTargets[toOffset] - fromX;
            var deltaY = shapeTargets[toOffset + 1] - fromY;
            var transportX = fromX + deltaX * transportStage;
            var transportY = fromY + deltaY * transportStage;
            var travelDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            var bend = flowPulse * (0.085 + 0.105 * Math.min(travelDistance, 1)) * spinDirection * particle.flowBias;
            var curvedX = transportX - deltaY * bend;
            var curvedY = transportY + deltaX * bend;
            var transportRadius = Math.sqrt(curvedX * curvedX + curvedY * curvedY);
            var fieldTurn = flowPulse * spinDirection * (0.08 + 0.15 * Math.min(transportRadius, 0.95)) * particle.flowBias;
            var fieldCos = Math.cos(fieldTurn);
            var fieldSin = Math.sin(fieldTurn);
            var particleX = curvedX * fieldCos - curvedY * fieldSin;
            var particleY = curvedX * fieldSin + curvedY * fieldCos;
            particle.renderX = centreX + particleX * scaleX;
            particle.renderY = centreY + particleY * scaleY;

            if (particle.tailed && !reducedMotion && !holding) recordTail(particle);
          }

          drawTails(holding ? 0 : 1);
          drawParticles();
          hasPainted = true;
        }

        function drawCurrentPhase() {
          var progress = Math.min(segmentElapsed / duration, 1);
          if (shapeIndex < 0) {
            drawOpening(progress);
            return;
          }

          drawMorph(progress, shapeIndex, (shapeIndex + 1) % shapeCount);
        }

        function resizeCanvas() {
          resizeFrame = 0;
          var nextWidth = canvas.offsetWidth;
          var nextHeight = canvas.offsetHeight;
          var nextPixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
          if (!nextWidth || !nextHeight) return;
          if (nextWidth === width && nextHeight === height && nextPixelRatio === pixelRatio) return;

          width = nextWidth;
          height = nextHeight;
          pixelRatio = nextPixelRatio;
          centreX = width * 0.5;
          centreY = height * 0.5;
          var visualScale = Math.min(width * 0.5, height * 0.5);
          scaleX = visualScale;
          scaleY = visualScale;
          canvas.width = Math.round(width * pixelRatio);
          canvas.height = Math.round(height * pixelRatio);
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          resetTails();
          hasPainted = false;
          isHolding = false;
          lastPaint = null;
          requestRender();
        }

        function queueResize() {
          if (!resizeFrame) resizeFrame = window.requestAnimationFrame(resizeCanvas);
        }

        function requestRender() {
          if (animationFrame || !isInViewport || !isPageVisible || !width || !height) return;
          if (hasPainted && reducedMotion) return;
          animationFrame = window.requestAnimationFrame(render);
        }

        function cancelRender() {
          if (!animationFrame || !window.cancelAnimationFrame) return;
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }

        function updateMotionMode() {
          var nextReducedMotion = motionPreference.matches;
          if (nextReducedMotion === reducedMotion) return;
          reducedMotion = nextReducedMotion;
          cancelRender();
          segmentElapsed = 0;
          shapeIndex = -1;
          loopStylesReady = false;
          isHolding = false;
          resetTails();
          hasPainted = false;
          lastPaint = null;
          requestRender();
        }

        function updateViewportMode() {
          cancelRender();
          buildParticles();
          segmentElapsed = 0;
          shapeIndex = -1;
          loopStylesReady = false;
          isHolding = false;
          hasPainted = false;
          lastPaint = null;
          resizeCanvas();
          requestRender();
        }

        function render(time) {
          animationFrame = 0;
          if (!isInViewport || !isPageVisible) return;

          if (reducedMotion) {
            drawOpening(1);
            return;
          }

          if (lastPaint === null) {
            lastPaint = time;
            isHolding = segmentElapsed >= duration;
            drawCurrentPhase();
          } else if (time - lastPaint >= frameInterval) {
            segmentElapsed += Math.min(time - lastPaint, 80);
            while (segmentElapsed >= duration + holdDuration) {
              segmentElapsed -= duration + holdDuration;
              shapeIndex = shapeIndex < 0 ? 0 : (shapeIndex + 1) % shapeCount;
              resetTails();
            }
            var wasHolding = isHolding;
            isHolding = segmentElapsed >= duration;
            lastPaint = time;
            if (!isHolding || !wasHolding) drawCurrentPhase();
          }

          requestRender();
        }

        buildParticles();
        resizeCanvas();

        if (window.ResizeObserver) {
          new window.ResizeObserver(queueResize).observe(canvas);
        } else {
          window.addEventListener('resize', queueResize, { passive: true });
        }

        if (window.IntersectionObserver) {
          new window.IntersectionObserver(function (entries) {
            isInViewport = entries[0].isIntersecting && entries[0].intersectionRatio > 0.08;
            if (isInViewport) {
              lastPaint = null;
              requestRender();
            } else {
              cancelRender();
            }
          }, { threshold: 0.08 }).observe(canvas);
        }

        if (mobileViewport.addEventListener) {
          mobileViewport.addEventListener('change', updateViewportMode);
          motionPreference.addEventListener('change', updateMotionMode);
        } else if (mobileViewport.addListener) {
          mobileViewport.addListener(updateViewportMode);
          motionPreference.addListener(updateMotionMode);
        }

        document.addEventListener('visibilitychange', function () {
          isPageVisible = document.visibilityState !== 'hidden';
          if (isPageVisible) {
            lastPaint = null;
            requestRender();
          } else {
            cancelRender();
          }
        });
})();
