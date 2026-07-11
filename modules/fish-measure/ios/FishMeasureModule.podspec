Pod::Spec.new do |s|
  s.name           = 'FishMeasureModule'
  s.version        = '1.0.0'
  s.summary        = 'LiDAR fish measurement pipeline'
  s.description    = 'ARKit + Vision pipeline that segments a fish, measures curved length via LiDAR depth, and captures catch artifacts.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '17.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
